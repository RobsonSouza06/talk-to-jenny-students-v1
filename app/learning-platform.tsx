"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArchiveX,
  ArrowRight,
  BookCheck,
  BookOpenText,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  FileQuestion,
  Gamepad2,
  GraduationCap,
  Headphones,
  History,
  Home,
  Layers3,
  LibraryBig,
  LockKeyhole,
  LogOut,
  Mail,
  PencilLine,
  Play,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

import {
  firebaseAuthUsersUrl,
  isFirebaseConfigured,
} from "@/lib/firebase-client";
import {
  clearStudentAttempts,
  createStudentProfile,
  deleteBookPermanently,
  deleteStudentPermanently,
  loadAuditLogs,
  loadStudentAttempts,
  loadStudentAnswerCounts,
  loadStudentWorkspace,
  loadTeacherWorkspace,
  loadTrashItems,
  moveLesson,
  moveHomeworkQuestionToTrash,
  moveLessonToTrash,
  observeAuth,
  purgeExpiredTrash,
  purgeTrashItem,
  requestPasswordReset,
  restoreTrashItem,
  saveBook,
  saveLesson,
  saveStudentAttempt,
  signIn,
  signOutCurrentUser,
  updateStudentProgress,
  type FirebaseSession,
  type AuditLog,
  type StudentAttempt,
  type TrashItem,
} from "@/lib/firebase-learning-repository";

import {
  type BookSummary,
  type HomeworkQuestion,
  type LearningSection,
  type LessonSummary,
  type Student,
} from "./demo-data";

type Role = "teacher" | "student";
type TeacherView = "home" | "content" | "students" | "data";
type StudentView = "home" | "lessons" | "homework";
type LessonKey = {
  bookId: string;
  lessonId: string;
};
type BlockEditorState = LessonKey & {
  index: number | null;
};
type DeleteRequest = {
  kind: "answers" | "student" | "homework" | "lesson" | "book" | "trash";
  targetId: string;
  bookId?: string;
  lessonId?: string;
  title: string;
  description: string;
  affected: string;
  confirmation: string;
  actionLabel?: string;
};

function matchesLesson(lesson: LessonSummary, key?: LessonKey | null) {
  return Boolean(
    key
    && lesson.bookId === key.bookId
    && lesson.id === key.lessonId,
  );
}

function studentBookAccess(
  student: Student,
  books: BookSummary[],
  lessons: LessonSummary[],
) {
  const explicitAccess = Object.fromEntries(
    Object.entries(student.bookAccess ?? {}).filter(([bookId, lessonLimit]) => (
      books.some((book) => book.id === bookId)
      && Number.isInteger(lessonLimit)
      && lessonLimit > 0
    )),
  );
  if (Object.keys(explicitAccess).length > 0) return explicitAccess;

  return Object.fromEntries(
    books
      .filter((book) => book.order <= student.currentBook)
      .map((book) => {
        const maximumLesson = Math.max(
          1,
          ...lessons
            .filter((lesson) => lesson.bookId === book.id)
            .map((lesson) => lesson.order),
        );
        return [
          book.id,
          book.order < student.currentBook
            ? maximumLesson
            : student.currentLesson,
        ];
      }),
  );
}

function primaryBookForAccess(
  access: Record<string, number>,
  books: BookSummary[],
) {
  return books
    .filter((book) => access[book.id] !== undefined)
    .sort((a, b) => b.order - a.order)[0];
}

function studentAccessSummary(
  student: Student,
  books: BookSummary[],
  lessons: LessonSummary[],
) {
  const access = studentBookAccess(student, books, lessons);
  const entries = books
    .filter((book) => access[book.id] !== undefined)
    .sort((a, b) => a.order - b.order)
    .map((book) => `Livro ${book.order} · Lesson ${access[book.id]}`);
  return entries.join(" | ") || `Livro ${student.currentBook} · Lesson ${student.currentLesson}`;
}

function accessFromStudentForm(
  form: FormData,
  books: BookSummary[],
  lessons: LessonSummary[],
) {
  const selectedBookIds = new Set(form.getAll("bookAccess").map(String));
  return Object.fromEntries(
    books
      .filter((book) => selectedBookIds.has(book.id))
      .map((book) => {
        const availableOrders = lessons
          .filter((lesson) => lesson.bookId === book.id)
          .map((lesson) => lesson.order);
        const maximumLesson = Math.max(1, ...availableOrders);
        const requestedLesson = Number(form.get(`bookLesson:${book.id}`) ?? 1);
        return [book.id, Math.min(Math.max(requestedLesson, 1), maximumLesson)];
      }),
  );
}

function studentAttemptState(attempts: Record<string, StudentAttempt>) {
  return {
    answers: Object.fromEntries(
      Object.values(attempts).map((attempt) => [
        attempt.questionId,
        attempt.answer,
      ]),
    ),
    revealedAnswers: Object.fromEntries(
      Object.values(attempts).map((attempt) => [
        attempt.questionId,
        attempt.revealed,
      ]),
    ),
  };
}

function lessonBlocks(lesson: LessonSummary): LearningSection[] {
  if ((lesson.content?.length ?? 0) > 0) {
    return (lesson.content ?? [])
      .map((section, index) => ({
        ...section,
        audience: section.audience === "teacher"
          ? "teacher" as const
          : "student" as const,
        order: Number.isFinite(section.order) ? section.order : index,
      }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return lesson.sections.map((title, index) => ({
    id: `section-${index + 1}`,
    title,
    items: [],
    audience: "student",
    order: index,
  }));
}

const teacherNavigation: Array<{ id: TeacherView; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Início", icon: Home },
  { id: "content", label: "Conteúdo", icon: LibraryBig },
  { id: "students", label: "Alunos", icon: Users },
  { id: "data", label: "Dados", icon: Database },
];

const studentNavigation: Array<{ id: StudentView; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Início", icon: Home },
  { id: "lessons", label: "Minhas lições", icon: BookOpenText },
  { id: "homework", label: "Homework", icon: ClipboardCheck },
];

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const STARTUP_TIMEOUT_MS = 12_000;
const AUTH_TIMEOUT_MS = 15_000;

function withStartupTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error("startup-timeout"));
    }, STARTUP_TIMEOUT_MS);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

async function loadWithRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withStartupTimeout(operation());
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 450));
      }
    }
  }
  throw lastError;
}

export function LearningPlatform() {
  const [session, setSession] = useState<FirebaseSession | null>(null);
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured);
  const [authError, setAuthError] = useState("");
  const [authRetryKey, setAuthRetryKey] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }
    const timeoutId = globalThis.setTimeout(() => {
      setAuthError("A conexão demorou mais que o esperado. Tente novamente.");
      setAuthLoading(false);
    }, AUTH_TIMEOUT_MS);
    const unsubscribe = observeAuth((nextSession, error) => {
      globalThis.clearTimeout(timeoutId);
      setSession(nextSession);
      setAuthError(error?.message ?? "");
      setAuthLoading(false);
    });
    return () => {
      globalThis.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [authRetryKey]);

  function retryAuthentication() {
    setSession(null);
    setAuthError("");
    setAuthLoading(true);
    setAuthRetryKey((current) => current + 1);
  }

  if (!isFirebaseConfigured) {
    return <ConfigurationMissing />;
  }
  if (authLoading) {
    return <AppLoading message="Conectando com segurança..." />;
  }
  if (!session) {
    return <LoginScreen accessError={authError} onRetry={retryAuthentication} />;
  }
  return <LearningWorkspace session={session} />;
}

function LearningWorkspace({ session }: { session: FirebaseSession }) {
  const accountRole = session.profile.role;
  const [role, setRole] = useState<Role>(accountRole);
  const [teacherView, setTeacherView] = useState<TeacherView>("home");
  const [studentView, setStudentView] = useState<StudentView>("home");
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceRetryKey, setWorkspaceRetryKey] = useState(0);
  const [activeStudentId, setActiveStudentId] = useState(
    accountRole === "student" ? session.user.uid : "",
  );
  const [managedStudentId, setManagedStudentId] = useState<string | null>(null);
  const [draftBookAccess, setDraftBookAccess] = useState<Record<string, number>>({});
  const [selectedBookId, setSelectedBookId] = useState("book-1");
  const [selectedLessonId, setSelectedLessonId] = useState("lesson-1");
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [newLessonOpen, setNewLessonOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [editingLessonKey, setEditingLessonKey] = useState<LessonKey | null>(null);
  const [blockEditor, setBlockEditor] = useState<BlockEditorState | null>(null);
  const [newHomeworkOpen, setNewHomeworkOpen] = useState(false);
  const [editingHomework, setEditingHomework] = useState<{
    bookId: string;
    lessonId: string;
    questionId: string;
  } | null>(null);
  const [newStudentOpen, setNewStudentOpen] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspace() {
      setWorkspaceLoading(true);
      setWorkspaceError("");
      try {
        const data = await loadWithRetry(() => (
          accountRole === "teacher"
            ? loadTeacherWorkspace()
            : loadStudentWorkspace(session.user.uid)
        ));
        if (cancelled) return;
        setBooks(data.books);
        setLessons(data.lessons);
        setStudents(data.students);
        setTrashItems(data.trashItems);
        setAuditLogs(data.auditLogs);
        const firstStudent = data.students[0];
        setActiveStudentId(firstStudent?.id ?? "");
        const firstBook = data.books[0];
        const initialBook = accountRole === "student"
          ? data.books.find((book) => book.order === firstStudent?.currentBook)
            ?? firstBook
          : firstBook;
        const bookLessons = data.lessons
          .filter((lesson) => lesson.bookId === initialBook?.id)
          .sort((a, b) => a.order - b.order);
        const initialLesson = accountRole === "student"
          ? bookLessons.find((lesson) => lesson.order === firstStudent?.currentLesson)
            ?? bookLessons[0]
          : bookLessons[0];
        setSelectedBookId(initialBook?.id ?? "");
        setSelectedLessonId(initialLesson?.id ?? "");
        const attemptState = studentAttemptState(data.attempts);
        setAnswers(attemptState.answers);
        setRevealedAnswers(attemptState.revealedAnswers);
        if (accountRole === "teacher") {
          void loadStudentAnswerCounts(data.students.map((student) => student.id))
            .then((answerCounts) => {
              if (cancelled) return;
              setStudents((current) => current.map((student) => ({
                ...student,
                answered: answerCounts[student.id] ?? student.answered,
              })));
            })
            .catch(() => undefined);
          void (async () => {
            try {
              await purgeExpiredTrash();
              const [nextTrashItems, nextAuditLogs] = await Promise.all([
                loadTrashItems(),
                loadAuditLogs(),
              ]);
              if (cancelled) return;
              setTrashItems(nextTrashItems);
              setAuditLogs(nextAuditLogs);
            } catch {
              // A área principal continua disponível se os dados de proteção atrasarem.
            }
          })();
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "";
          setWorkspaceError(
            message === "startup-timeout"
              ? "A conexão com o Firebase demorou mais que o esperado. Verifique a internet e tente novamente."
              : message || "Não foi possível carregar os dados.",
          );
        }
      } finally {
        if (!cancelled) setWorkspaceLoading(false);
      }
    }
    loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [accountRole, session.user.uid, workspaceRetryKey]);

  if (workspaceLoading) {
    return <AppLoading message="Carregando seus dados..." />;
  }
  if (workspaceError) {
    return (
      <AccessState
        title="Não foi possível abrir o aplicativo"
        message={workspaceError}
        onRetry={() => {
          setWorkspaceError("");
          setWorkspaceLoading(true);
          setWorkspaceRetryKey((current) => current + 1);
        }}
        onExit={signOutCurrentUser}
      />
    );
  }
  if (books.length === 0) {
    return (
      <AccessState
        title="Nenhum conteúdo disponível"
        message="Entre novamente após a professora publicar o primeiro livro."
        onExit={signOutCurrentUser}
      />
    );
  }

  const activeStudent =
    students.find((student) => student.id === activeStudentId) ?? students[0];
  const managedStudent = managedStudentId
    ? students.find((student) => student.id === managedStudentId)
    : undefined;
  const selectedBook = books.find((book) => book.id === selectedBookId) ?? books[0];
  const selectedBookLessons = lessons
    .filter((lesson) => lesson.bookId === selectedBook?.id)
    .sort((a, b) => a.order - b.order);
  const selectedTeacherLesson =
    selectedBookLessons.find((lesson) => lesson.id === selectedLessonId)
    ?? selectedBookLessons[0];
  const activeStudentBookAccess = activeStudent
    ? studentBookAccess(activeStudent, books, lessons)
    : {};
  const availableStudentBooks = books.filter(
    (book) => activeStudentBookAccess[book.id] !== undefined,
  );
  const activeBook = availableStudentBooks.find((book) => book.id === selectedBookId)
    ?? availableStudentBooks.find((book) => book.order === activeStudent?.currentBook)
    ?? availableStudentBooks.at(-1)
    ?? books[0];
  const activeLessonLimit = activeStudentBookAccess[activeBook?.id]
    ?? activeStudent?.currentLesson
    ?? 1;
  const activeBookLessons = lessons
    .filter((lesson) => lesson.bookId === activeBook?.id)
    .sort((a, b) => a.order - b.order);
  const availableStudentLessons = activeBookLessons.filter(
    (lesson) =>
      lesson.order <= activeLessonLimit
      && lesson.status === "published",
  );
  const currentStudentLesson =
    availableStudentLessons.find((lesson) => lesson.order === activeLessonLimit)
    ?? availableStudentLessons.at(-1);
  const selectedStudentLesson =
    availableStudentLessons.find((lesson) => lesson.id === selectedLessonId)
    ?? currentStudentLesson
    ?? availableStudentLessons[0];
  const editingBook = books.find((book) => book.id === editingBookId);
  const editingLesson = lessons.find((lesson) =>
    matchesLesson(lesson, editingLessonKey),
  );
  const editingHomeworkLesson = lessons.find(
    (lesson) => matchesLesson(lesson, editingHomework),
  );
  const editingHomeworkQuestion = editingHomeworkLesson?.homework?.find(
    (question) => question.id === editingHomework?.questionId,
  );
  const blockLesson = lessons.find((lesson) => matchesLesson(lesson, blockEditor));
  const totalAnswers = students.reduce((total, student) => total + student.answered, 0);
  const homeworkLesson = studentView === "home"
    ? currentStudentLesson
    : selectedStudentLesson;
  const selectedHomework = homeworkLesson?.homework ?? [];
  const completedHomework = selectedHomework.filter(
    (question) => revealedAnswers[question.id],
  ).length;
  const remainingHomework = Math.max(
    0,
    selectedHomework.length - completedHomework,
  );
  const homeworkComplete =
    selectedHomework.length > 0 && remainingHomework === 0;
  const availableAudioCount = lessons.reduce(
    (total, lesson) => total + lessonAudioCount(lesson),
    0,
  );

  const studentProgress = activeStudent
    ? Math.min(
        100,
        Math.round(
          (activeLessonLimit
            / Math.max(
              activeBook?.lessonCount ?? 0,
              activeBookLessons.length,
              activeLessonLimit,
              1,
            ))
            * 100,
        ),
      )
    : 0;

  function findStudentLesson(student: Student) {
    const access = studentBookAccess(student, books, lessons);
    const book = books.find((item) => item.order === student.currentBook)
      ?? primaryBookForAccess(access, books);
    const lessonLimit = access[book?.id ?? ""] ?? student.currentLesson;
    const bookLessons = lessons
      .filter((lesson) => lesson.bookId === book?.id)
      .sort((a, b) => a.order - b.order);
    return (
      bookLessons.find((lesson) => lesson.order === lessonLimit)
      ?? bookLessons.filter((lesson) => lesson.order <= lessonLimit).at(-1)
      ?? bookLessons[0]
    );
  }

  function selectBook(bookId: string) {
    setSelectedBookId(bookId);
    const firstLesson = lessons
      .filter((lesson) => lesson.bookId === bookId)
      .sort((a, b) => a.order - b.order)[0];
    if (firstLesson) setSelectedLessonId(firstLesson.id);
  }

  function selectStudentBook(bookId: string) {
    if (activeStudentBookAccess[bookId] === undefined) return;
    setSelectedBookId(bookId);
    const lessonLimit = activeStudentBookAccess[bookId];
    const bookLessons = lessons
      .filter((lesson) => (
        lesson.bookId === bookId
        && lesson.order <= lessonLimit
        && lesson.status === "published"
      ))
      .sort((a, b) => a.order - b.order);
    const nextLesson = bookLessons.find((lesson) => lesson.order === lessonLimit)
      ?? bookLessons.at(-1);
    setSelectedLessonId(nextLesson?.id ?? "");
  }

  function openCurrentStudentView(view: StudentView) {
    if (currentStudentLesson) {
      setSelectedLessonId(currentStudentLesson.id);
    }
    setStudentView(view);
  }

  function openStudentLesson(lessonOrder: number) {
    const lesson = activeBookLessons.find((item) => item.order === lessonOrder);
    if (lesson) {
      setSelectedLessonId(lesson.id);
    }
    setStudentView("lessons");
  }

  async function loadPreviewAttemptState(studentId: string) {
    setAnswers({});
    setRevealedAnswers({});
    try {
      const attemptState = studentAttemptState(
        await loadStudentAttempts(studentId),
      );
      setAnswers(attemptState.answers);
      setRevealedAnswers(attemptState.revealedAnswers);
    } catch {
      toast.error("Não foi possível carregar as respostas deste aluno.");
    }
  }

  function changeRole(nextRole: Role) {
    if (accountRole !== "teacher") return;
    setRole(nextRole);
    if (nextRole === "student") {
      setStudentView("home");
      const lesson = activeStudent ? findStudentLesson(activeStudent) : undefined;
      if (lesson) {
        setSelectedBookId(lesson.bookId);
        setSelectedLessonId(lesson.id);
      }
      if (activeStudent) void loadPreviewAttemptState(activeStudent.id);
    }
  }

  function openStudent(student: Student) {
    setManagedStudentId(student.id);
    setDraftBookAccess(studentBookAccess(student, books, lessons));
  }

  async function saveStudentProgress() {
    if (!managedStudent) return;
    const primaryBook = primaryBookForAccess(draftBookAccess, books);
    if (!primaryBook) {
      toast.error("Selecione pelo menos um livro para o aluno.");
      return;
    }
    const nextBook = primaryBook.order;
    const nextLesson = draftBookAccess[primaryBook.id];
    try {
      await updateStudentProgress({
        studentId: managedStudent.id,
        bookAccess: draftBookAccess,
        currentBook: nextBook,
        currentLesson: nextLesson,
      });
      setLessons((current) =>
        current.map((lesson) =>
          draftBookAccess[lesson.bookId] !== undefined
            && lesson.order <= draftBookAccess[lesson.bookId]
            ? { ...lesson, status: "published" }
            : lesson,
        ),
      );
      setStudents((current) =>
        current.map((student) =>
          student.id === managedStudent.id
            ? {
                ...student,
                bookAccess: draftBookAccess,
                currentBook: nextBook,
                currentLesson: nextLesson,
              }
            : student,
        ),
      );
      toast.success("Progresso do aluno atualizado.");
    } catch {
      toast.error("Não foi possível salvar o progresso.");
    }
  }

  function previewStudent(student: Student) {
    setActiveStudentId(student.id);
    setManagedStudentId(null);
    setRole("student");
    setStudentView("home");
    void loadPreviewAttemptState(student.id);
    const lesson = findStudentLesson(student);
    if (lesson) {
      setSelectedBookId(lesson.bookId);
      setSelectedLessonId(lesson.id);
    }
  }

  async function addBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const nextOrder = Math.max(0, ...books.map((book) => book.order)) + 1;
    const title = String(form.get("title") ?? "").trim() || `Livro ${nextOrder}`;
    const practice = practiceFieldsFrom(form);
    if (!practice) {
      toast.error("Use um link iniciado por https://.");
      return;
    }
    const book: BookSummary = {
      id: `book-${Date.now()}`,
      order: nextOrder,
      title,
      lessonCount: 0,
      published: true,
      ...practice,
    };
    try {
      await saveBook(book);
      setBooks((current) => [...current, book]);
      setSelectedBookId(book.id);
      setNewBookOpen(false);
      setTeacherView("content");
      toast.success(`${title} criado.`);
      formElement.reset();
    } catch {
      toast.error("Não foi possível criar o livro.");
    }
  }

  async function updateBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBook) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) {
      toast.error("Informe o nome do livro.");
      return;
    }
    const practice = practiceFieldsFrom(form);
    if (!practice) {
      toast.error("Use um link iniciado por https://.");
      return;
    }
    const updatedBook = { ...editingBook, title, ...practice };
    try {
      await saveBook(updatedBook);
      setBooks((current) =>
        current.map((book) => (book.id === editingBook.id ? updatedBook : book)),
      );
      setEditingBookId(null);
      toast.success("Livro atualizado.");
    } catch {
      toast.error("Não foi possível atualizar o livro.");
    }
  }

  async function addLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") ?? "").trim();
    const subtitle = String(form.get("subtitle") ?? "").trim();
    const bookId = String(form.get("book") ?? selectedBookId);
    if (!title) {
      toast.error("Informe o título da lição.");
      return;
    }
    const nextOrder = Math.max(
      0,
      ...lessons.filter((lesson) => lesson.bookId === bookId).map((lesson) => lesson.order),
    ) + 1;
    const newLesson: LessonSummary = {
      id: `lesson-${Date.now()}`,
      bookId,
      order: nextOrder,
      title,
      subtitle,
      status: "draft",
      sections: [],
      homeworkCount: 0,
      audioCount: 0,
      content: [],
      homework: [],
    };
    try {
      await saveLesson(newLesson);
      setLessons((current) => [...current, newLesson]);
      setBooks((current) =>
        current.map((book) =>
          book.id === bookId
            ? { ...book, lessonCount: (book.lessonCount ?? 0) + 1 }
            : book,
        ),
      );
      setSelectedBookId(bookId);
      setSelectedLessonId(newLesson.id);
      setNewLessonOpen(false);
      setTeacherView("content");
      toast.success("Lição criada como rascunho.");
      formElement.reset();
    } catch {
      toast.error("Não foi possível criar a lição.");
    }
  }

  async function updateLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingLesson) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const subtitle = String(form.get("subtitle") ?? "").trim();
    const bookId = String(form.get("book") ?? editingLesson.bookId);
    const order = Number(form.get("order"));
    if (!title || !Number.isInteger(order) || order < 1) {
      toast.error("Informe o título e o número da lição.");
      return;
    }
    const orderInUse = lessons.some(
      (lesson) =>
        !(
          lesson.id === editingLesson.id
          && lesson.bookId === editingLesson.bookId
        )
        && lesson.bookId === bookId
        && lesson.order === order,
    );
    if (orderInUse) {
      toast.error(`A Lesson ${order} já existe neste livro.`);
      return;
    }
    const updatedLesson = { ...editingLesson, bookId, order, title, subtitle };
    try {
      await moveLesson(editingLesson.bookId, updatedLesson);
      setLessons((current) =>
        current.map((lesson) =>
          lesson.id === editingLesson.id
            && lesson.bookId === editingLesson.bookId
            ? updatedLesson
            : lesson,
        ),
      );
      if (editingLesson.bookId !== bookId) {
        setBooks((current) =>
          current.map((book) => {
            if (book.id === editingLesson.bookId) {
              return {
                ...book,
                lessonCount: Math.max(0, (book.lessonCount ?? 0) - 1),
              };
            }
            if (book.id === bookId) {
              return { ...book, lessonCount: (book.lessonCount ?? 0) + 1 };
            }
            return book;
          }),
        );
      }
      setSelectedBookId(bookId);
      setSelectedLessonId(editingLesson.id);
      setEditingLessonKey(null);
      toast.success("Lição atualizada.");
    } catch {
      toast.error("Não foi possível atualizar a lição.");
    }
  }

  async function saveBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blockEditor || !blockLesson) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      toast.error("Informe o nome do bloco.");
      return;
    }
    const audience = form.get("audience") === "teacher"
      ? "teacher" as const
      : "student" as const;
    const kind = form.get("kind") === "story"
      ? "story" as const
      : "standard" as const;
    const rawAudioEmbed = String(form.get("audioEmbed") ?? "").trim();
    const audioEmbedUrl = safeAudioComEmbedUrl(rawAudioEmbed);
    if (rawAudioEmbed && !audioEmbedUrl) {
      toast.error("Cole o código Share → Embed ou um link /embed/ válido do Audio.com.");
      return;
    }
    const englishLines = String(form.get("english") ?? "").split(/\r?\n/);
    const portugueseLines = String(form.get("portuguese") ?? "").split(/\r?\n/);
    const itemCount = Math.max(englishLines.length, portugueseLines.length);
    const items = Array.from({ length: itemCount }, (_, index) => ({
      english: englishLines[index]?.trim() ?? "",
      portuguese: portugueseLines[index]?.trim() ?? "",
      audioText: englishLines[index]?.trim() || undefined,
    })).filter((item) => item.english || item.portuguese);
    const content: LearningSection[] = lessonBlocks(blockLesson);
    const contentIndex = blockEditor.index ?? content.length;
    const previousContent = content[contentIndex];
    content[contentIndex] = {
      id: previousContent?.id ?? `section-${blockLesson.id}-${contentIndex + 1}`,
      title: name,
      items,
      audioEmbedUrl: audioEmbedUrl || undefined,
      kind,
      audience,
      order: contentIndex,
    };
    const orderedContent = content.map((section, index) => ({
      ...section,
      order: index,
    }));
    const sections = orderedContent
      .filter((section) => section.audience !== "teacher")
      .map((section) => section.title);
    const updatedLesson = {
      ...blockLesson,
      sections,
      content: orderedContent,
      audioCount: orderedContent.filter((section) => section.audioEmbedUrl).length,
    };
    try {
      await saveLesson(updatedLesson);
      setLessons((current) =>
        current.map((lesson) =>
          lesson.id === blockLesson.id && lesson.bookId === blockLesson.bookId
            ? updatedLesson
            : lesson,
        ),
      );
      setBlockEditor(null);
      toast.success(
        blockEditor.index === null ? "Bloco adicionado." : "Bloco atualizado.",
      );
    } catch {
      toast.error("Não foi possível salvar o bloco.");
    }
  }

  async function addHomework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const bookId = String(form.get("book") ?? "");
    const lessonId = String(form.get("lesson") ?? "");
    const category = String(form.get("category") ?? "Homework").trim() || "Homework";
    const question = String(form.get("question") ?? "").trim();
    const answer = String(form.get("answer") ?? "").trim();
    if (!bookId || !lessonId || !question || !answer) {
      toast.error("Preencha a lição, a pergunta e a resposta correta.");
      return;
    }
    const lesson = lessons.find(
      (item) => item.id === lessonId && item.bookId === bookId,
    );
    if (!lesson) return;
    const homework = [
      ...(lesson.homework ?? []),
      {
        id: `question-${Date.now()}`,
        category,
        prompt: question,
        answer,
      },
    ];
    const updatedLesson = {
      ...lesson,
      homework,
      homeworkCount: homework.length,
    };
    try {
      await saveLesson(updatedLesson);
      setLessons((current) =>
        current.map((item) =>
          item.id === lessonId && item.bookId === bookId ? updatedLesson : item,
        ),
      );
      setSelectedBookId(lesson.bookId);
      setSelectedLessonId(lesson.id);
      setNewHomeworkOpen(false);
      toast.success("Pergunta adicionada ao homework.");
      formElement.reset();
    } catch {
      toast.error("Não foi possível salvar a pergunta.");
    }
  }

  async function updateHomework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingHomework || !editingHomeworkLesson || !editingHomeworkQuestion) return;
    const form = new FormData(event.currentTarget);
    const category = String(form.get("category") ?? "Homework").trim() || "Homework";
    const question = String(form.get("question") ?? "").trim();
    const answer = String(form.get("answer") ?? "").trim();
    if (!question || !answer) {
      toast.error("Preencha a pergunta e a resposta correta.");
      return;
    }
    const homework = (editingHomeworkLesson.homework ?? []).map((item) =>
      item.id === editingHomeworkQuestion.id
        ? { ...item, category, prompt: question, answer }
        : item,
    );
    const updatedLesson = {
      ...editingHomeworkLesson,
      homework,
      homeworkCount: homework.length,
    };
    try {
      await saveLesson(updatedLesson);
      setLessons((current) =>
        current.map((lesson) =>
          lesson.id === updatedLesson.id
            && lesson.bookId === updatedLesson.bookId
            ? updatedLesson
            : lesson,
        ),
      );
      setEditingHomework(null);
      toast.success("Pergunta atualizada.");
    } catch {
      toast.error("Não foi possível atualizar a pergunta.");
    }
  }

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const uid = String(form.get("uid") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const bookAccess = accessFromStudentForm(form, books, lessons);
    const initialBook = primaryBookForAccess(bookAccess, books);
    const initialLesson = initialBook ? bookAccess[initialBook.id] : 1;
    if (!uid || uid.length > 128 || uid.includes("/") || !name || !email) {
      toast.error("Preencha o UID, o nome e o e-mail da conta criada no Firebase.");
      return;
    }
    if (!initialBook) {
      toast.error("Selecione pelo menos um livro para o aluno.");
      return;
    }
    try {
      const student = await createStudentProfile({
        uid,
        name,
        email,
        bookAccess,
        currentBook: initialBook.order,
        currentLesson: initialLesson,
      });
      setLessons((current) =>
        current.map((lesson) =>
          bookAccess[lesson.bookId] !== undefined
            && lesson.order <= bookAccess[lesson.bookId]
            ? { ...lesson, status: "published" }
            : lesson,
        ),
      );
      setStudents((current) => [...current, student]);
      setNewStudentOpen(false);
      toast.success("Aluno cadastrado.");
      formElement.reset();
    } catch (error) {
      const message = error instanceof Error
        && error.message.includes("student-profile-already-exists")
        ? "Este UID já está vinculado a um aluno."
        : "Não foi possível cadastrar o aluno.";
      toast.error(message);
    }
  }

  function requestDelete(request: DeleteRequest) {
    setDeleteConfirmation("");
    setDeleteRequest(request);
  }

  async function refreshProtectionData() {
    const [nextTrashItems, nextAuditLogs] = await Promise.all([
      loadTrashItems(),
      loadAuditLogs(),
    ]);
    setTrashItems(nextTrashItems);
    setAuditLogs(nextAuditLogs);
  }

  async function confirmDelete() {
    if (
      !deleteRequest
      || deleteConfirmation !== deleteRequest.confirmation
    ) return;
    try {
      if (deleteRequest.kind === "answers") {
        await clearStudentAttempts(deleteRequest.targetId);
        setStudents((current) =>
          current.map((student) =>
            student.id === deleteRequest.targetId
              ? { ...student, answered: 0 }
              : student,
          ),
        );
        toast.success("Respostas do aluno excluídas permanentemente.");
      }
      if (deleteRequest.kind === "student") {
        await deleteStudentPermanently(deleteRequest.targetId);
        setStudents((current) =>
          current.filter((student) => student.id !== deleteRequest.targetId),
        );
        setManagedStudentId(null);
        toast.success("Dados excluídos. Remova também a conta no Authentication.");
      }
      if (deleteRequest.kind === "homework") {
        const lesson = lessons.find(
          (item) =>
            item.id === deleteRequest.lessonId
            && item.bookId === deleteRequest.bookId,
        );
        if (!lesson) throw new Error("Lição não encontrada.");
        const bookTitle = books.find((book) => book.id === lesson.bookId)?.title
          ?? "Livro";
        const trashItem = await moveHomeworkQuestionToTrash(
          lesson,
          deleteRequest.targetId,
          bookTitle,
        );
        const homework = (lesson.homework ?? []).filter(
          (question) => question.id !== deleteRequest.targetId,
        );
        const updatedLesson = {
          ...lesson,
          homework,
          homeworkCount: homework.length,
        };
        setLessons((current) =>
          current.map((item) =>
            item.id === lesson.id && item.bookId === lesson.bookId
              ? updatedLesson
              : item,
          ),
        );
        setTrashItems((current) => [trashItem, ...current]);
        setEditingHomework(null);
        await refreshProtectionData();
        toast.success("Pergunta movida para a lixeira por 10 dias.");
      }
      if (deleteRequest.kind === "lesson") {
        const deletedLesson = lessons.find(
          (lesson) =>
            lesson.id === deleteRequest.targetId
            && lesson.bookId === deleteRequest.bookId,
        );
        if (deletedLesson) {
          const bookTitle = books.find(
            (book) => book.id === deletedLesson.bookId,
          )?.title ?? "Livro";
          const trashItem = await moveLessonToTrash(
            deletedLesson,
            bookTitle,
          );
          setTrashItems((current) => [trashItem, ...current]);
        }
        setLessons((current) =>
          current.filter((lesson) => !(
            lesson.id === deleteRequest.targetId
            && lesson.bookId === deleteRequest.bookId
          )),
        );
        if (deletedLesson) {
          setBooks((current) =>
            current.map((book) =>
              book.id === deletedLesson.bookId
                ? {
                    ...book,
                    lessonCount: Math.max(0, (book.lessonCount ?? 0) - 1),
                  }
                : book,
            ),
          );
        }
        const nextLesson = lessons
          .filter(
            (lesson) =>
              lesson.id !== deleteRequest.targetId
              && lesson.bookId === deletedLesson?.bookId,
          )
          .sort((a, b) => a.order - b.order)[0];
        if (nextLesson) setSelectedLessonId(nextLesson.id);
        await refreshProtectionData();
        toast.success("Lição movida para a lixeira por 10 dias.");
      }
      if (deleteRequest.kind === "book") {
        await deleteBookPermanently(deleteRequest.targetId);
        const remainingBooks = books.filter(
          (book) => book.id !== deleteRequest.targetId,
        );
        const nextBook = remainingBooks[0];
        const nextLesson = lessons
          .filter((lesson) => lesson.bookId === nextBook?.id)
          .sort((a, b) => a.order - b.order)[0];
        setBooks(remainingBooks);
        setLessons((current) =>
          current.filter((lesson) => lesson.bookId !== deleteRequest.targetId),
        );
        if (nextBook) setSelectedBookId(nextBook.id);
        if (nextLesson) setSelectedLessonId(nextLesson.id);
        setEditingBookId(null);
        toast.success("Livro e conteúdo relacionado foram excluídos.");
      }
      if (deleteRequest.kind === "trash") {
        const item = trashItems.find(
          (trashItem) => trashItem.id === deleteRequest.targetId,
        );
        if (!item) throw new Error("Item não encontrado na lixeira.");
        await purgeTrashItem(item);
        await refreshProtectionData();
        toast.success("Item excluído permanentemente.");
      }
      setDeleteRequest(null);
      setDeleteConfirmation("");
    } catch (error) {
      const message = error instanceof Error
        && error.message.includes("trash-retention-active")
        ? "A exclusão permanente só fica disponível após 10 dias."
        : "Não foi possível concluir a exclusão.";
      toast.error(message);
    }
  }

  async function restoreDeletedItem(item: TrashItem) {
    try {
      await restoreTrashItem(item);
      if (item.kind === "lesson") {
        const restoredLesson = item.payload as LessonSummary;
        setLessons((current) => [...current, restoredLesson]);
        setBooks((current) => current.map((book) =>
          book.id === item.bookId
            ? { ...book, lessonCount: (book.lessonCount ?? 0) + 1 }
            : book,
        ));
        setSelectedBookId(item.bookId);
        setSelectedLessonId(item.lessonId);
      } else {
        const question = item.payload as HomeworkQuestion;
        setLessons((current) => current.map((lesson) => {
          if (lesson.id !== item.lessonId || lesson.bookId !== item.bookId) {
            return lesson;
          }
          const homework = [...(lesson.homework ?? [])];
          const position = Math.min(
            Math.max(item.position ?? homework.length, 0),
            homework.length,
          );
          homework.splice(position, 0, question);
          return { ...lesson, homework, homeworkCount: homework.length };
        }));
      }
      await refreshProtectionData();
      toast.success("Item restaurado no local original.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const message = code.includes("trash-lesson-conflict")
        ? "Já existe uma lição com este identificador nesse livro."
        : code.includes("trash-question-conflict")
          ? "Esta pergunta já existe novamente na lição."
          : code.includes("trash-book-missing")
            ? "O livro original não existe mais e o item não pode ser restaurado."
          : code.includes("trash-parent-missing")
            ? "Restaure primeiro a lição que continha esta pergunta."
            : "Não foi possível restaurar o item.";
      toast.error(message);
    }
  }

  async function toggleLessonStatus(lesson: LessonSummary) {
    const updatedLesson: LessonSummary = {
      ...lesson,
      status: lesson.status === "published" ? "draft" : "published",
    };
    try {
      await saveLesson(updatedLesson);
      setLessons((current) =>
        current.map((item) =>
          item.id === lesson.id && item.bookId === lesson.bookId
            ? updatedLesson
            : item,
        ),
      );
      toast.success(
        lesson.status === "published"
          ? "Lição voltou para rascunho."
          : "Lição publicada para os alunos liberados.",
      );
    } catch {
      toast.error("Não foi possível alterar a publicação.");
    }
  }

  async function revealAnswer(questionId: string) {
    if (!answers[questionId]?.trim()) {
      toast.error("Digite sua resposta antes de conferir.");
      return;
    }
    try {
      if (
        accountRole === "student"
        && activeStudent
        && selectedStudentLesson
      ) {
        await saveStudentAttempt({
          studentId: activeStudent.id,
          bookId: selectedStudentLesson.bookId,
          lessonId: selectedStudentLesson.id,
          questionId,
          answer: answers[questionId],
        });
      }
      setRevealedAnswers((current) => ({ ...current, [questionId]: true }));
    } catch {
      toast.error("Não foi possível salvar sua resposta.");
    }
  }

  const navigation = role === "teacher" ? teacherNavigation : studentNavigation;
  const currentView = role === "teacher" ? teacherView : studentView;

  function selectNavigation(id: string) {
    if (role === "teacher") setTeacherView(id as TeacherView);
    else {
      const nextView = id as StudentView;
      if (
        studentView === "home"
        && (nextView === "lessons" || nextView === "homework")
        && currentStudentLesson
      ) {
        setSelectedLessonId(currentStudentLesson.id);
      }
      setStudentView(nextView);
    }
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "17rem" } as React.CSSProperties}
      className="learning-shell"
    >
      <Sidebar collapsible="offcanvas" className="brand-sidebar">
        <SidebarHeader className="brand-sidebar-header">
          <Brand />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="brand-nav">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={currentView === item.id}
                        onClick={() => selectNavigation(item.id)}
                        size="lg"
                      >
                        <Icon />
                        <span>{item.label}</span>
                        {item.id === "homework"
                        && role === "student"
                        && selectedHomework.length > 0 ? (
                          <span
                            className={`sidebar-count ${homeworkComplete ? "complete" : ""}`}
                            aria-label={homeworkComplete
                              ? "Homework completed"
                              : `${remainingHomework} homework questions remaining`}
                          >
                            {homeworkComplete ? <Check /> : remainingHomework}
                          </span>
                        ) : null}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="brand-sidebar-footer">
          <div className="profile-line">
            <div className="profile-avatar">{role === "teacher" ? "J" : activeStudent?.initials}</div>
            <div className="profile-copy">
              <strong>{role === "teacher" ? session.profile.name || "Jenny" : activeStudent?.name}</strong>
              <span>{role === "teacher" ? "Professora" : `Livro ${activeStudent?.currentBook} · Aluno`}</span>
            </div>
          </div>
          {accountRole === "teacher" && (role === "student" || activeStudent) ? (
            <Button
              variant="ghost"
              className="role-preview-button"
              onClick={() => changeRole(role === "teacher" ? "student" : "teacher")}
            >
              {role === "teacher" ? <Eye /> : <GraduationCap />}
              {role === "teacher" ? "Prévia do aluno" : "Voltar para Jenny"}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            className="role-preview-button"
            onClick={() => void signOutCurrentUser()}
          >
            <LogOut /> Sair
          </Button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="app-inset">
        <header className="mobile-app-header">
          {role === "teacher" ? (
            <SidebarTrigger aria-label="Abrir menu" className="mobile-menu-trigger" />
          ) : accountRole === "teacher" ? (
            <Button
              variant="ghost"
              className="mobile-preview-return"
              onClick={() => changeRole("teacher")}
            >
              <GraduationCap />
              <span>Jenny</span>
            </Button>
          ) : (
            <span className="mobile-header-spacer" aria-hidden="true" />
          )}
          <Brand compact />
          {role === "student" && accountRole === "student" ? (
            <Button
              variant="ghost"
              className="mobile-student-logout"
              onClick={() => void signOutCurrentUser()}
            >
              <LogOut />
              <span>Sair</span>
            </Button>
          ) : (
            <div className="profile-avatar small">
              {role === "teacher" ? "J" : activeStudent?.initials}
            </div>
          )}
        </header>

        <main className="app-main">
          {role === "teacher" ? (
            <>
              {teacherView === "home" ? (
                <TeacherHome
                  books={books}
                  lessons={lessons}
                  students={students}
                  totalAnswers={totalAnswers}
                  onNavigate={setTeacherView}
                  onNewLesson={() => setNewLessonOpen(true)}
                  onNewStudent={() => setNewStudentOpen(true)}
                  onOpenStudent={openStudent}
                />
              ) : null}
              {teacherView === "content" ? (
                <TeacherContent
                  books={books}
                  selectedBook={selectedBook}
                  lessons={selectedBookLessons}
                  selectedLesson={selectedTeacherLesson}
                  onSelectBook={selectBook}
                  onSelectLesson={setSelectedLessonId}
                  onNewBook={() => setNewBookOpen(true)}
                  onEditBook={() => setEditingBookId(selectedBook.id)}
                  onNewLesson={() => setNewLessonOpen(true)}
                  onEditLesson={(lesson) => setEditingLessonKey({
                    bookId: lesson.bookId,
                    lessonId: lesson.id,
                  })}
                  onNewHomework={() => setNewHomeworkOpen(true)}
                  onEditHomework={(lesson, questionId) =>
                    setEditingHomework({
                      bookId: lesson.bookId,
                      lessonId: lesson.id,
                      questionId,
                    })
                  }
                  onDeleteHomework={(lesson, question) =>
                    requestDelete({
                      kind: "homework",
                      targetId: question.id,
                      bookId: lesson.bookId,
                      lessonId: lesson.id,
                      title: "Mover pergunta para a lixeira?",
                      description:
                        `Livro ${books.find((book) => book.id === lesson.bookId)?.order ?? ""} · Lesson ${lesson.order}. A pergunta poderá ser restaurada durante 10 dias e as respostas dos alunos serão preservadas nesse período.`,
                      affected: "1 pergunta",
                      confirmation: "EXCLUIR PERGUNTA",
                      actionLabel: "Mover para a lixeira",
                    })
                  }
                  onAddBlock={(lesson) =>
                    setBlockEditor({
                      bookId: lesson.bookId,
                      lessonId: lesson.id,
                      index: null,
                    })
                  }
                  onEditBlock={(lesson, index) =>
                    setBlockEditor({
                      bookId: lesson.bookId,
                      lessonId: lesson.id,
                      index,
                    })
                  }
                  onToggleStatus={toggleLessonStatus}
                  onDelete={(lesson) =>
                    requestDelete({
                      kind: "lesson",
                      targetId: lesson.id,
                      bookId: lesson.bookId,
                      lessonId: lesson.id,
                      title: `Mover Lesson ${lesson.order} para a lixeira?`,
                      description:
                        `${selectedBook.title}. A lição, seus blocos e o homework poderão ser restaurados durante 10 dias. As respostas dos alunos serão preservadas nesse período.`,
                      affected: `1 lição · ${lesson.homeworkCount} perguntas`,
                      confirmation: `EXCLUIR LIÇÃO ${lesson.order}`,
                      actionLabel: "Mover para a lixeira",
                    })
                  }
                />
              ) : null}
              {teacherView === "students" ? (
                <TeacherStudents
                  books={books}
                  lessons={lessons}
                  students={students}
                  onNewStudent={() => setNewStudentOpen(true)}
                  onOpenStudent={openStudent}
                />
              ) : null}
              {teacherView === "data" ? (
                <TeacherData
                  lessons={lessons}
                  students={students}
                  totalAnswers={totalAnswers}
                  audioCount={availableAudioCount}
                  onDeleteAnswers={(student) =>
                    requestDelete({
                      kind: "answers",
                      targetId: student.id,
                      title: `Excluir respostas de ${student.name}?`,
                      description: "O cadastro e o progresso serão mantidos.",
                      affected: `${student.answered} respostas armazenadas`,
                      confirmation: "EXCLUIR",
                    })
                  }
                  onDeleteStudent={(student) =>
                    requestDelete({
                      kind: "student",
                      targetId: student.id,
                      title: `Excluir ${student.name} permanentemente?`,
                      description:
                        "Cadastro, progresso e respostas serão removidos. A conta de acesso deve ser excluída separadamente no Firebase Authentication.",
                      affected: `1 cadastro · ${student.answered} respostas`,
                      confirmation: "EXCLUIR",
                    })
                  }
                  trashItems={trashItems}
                  auditLogs={auditLogs}
                  onRestoreTrash={restoreDeletedItem}
                  onPurgeTrash={(item) =>
                    requestDelete({
                      kind: "trash",
                      targetId: item.id,
                      title: "Excluir item permanentemente?",
                      description:
                        "Esta ação remove também as respostas relacionadas e não poderá ser desfeita.",
                      affected: item.label,
                      confirmation: "EXCLUIR DEFINITIVAMENTE",
                    })
                  }
                />
              ) : null}
            </>
          ) : (
            <>
              {studentView === "home" && activeStudent ? (
                <StudentHome
                  student={activeStudent}
                  book={activeBook}
                  lesson={currentStudentLesson}
                  lessonLimit={activeLessonLimit}
                  progress={studentProgress}
                  homeworkRemaining={remainingHomework}
                  homeworkComplete={homeworkComplete}
                  onOpenLesson={() => openCurrentStudentView("lessons")}
                  onOpenHomework={() => openCurrentStudentView("homework")}
                  onOpenLessonNumber={openStudentLesson}
                />
              ) : null}
              {studentView === "lessons" && activeStudent ? (
                <StudentLessons
                  lessons={activeBookLessons}
                  book={activeBook}
                  books={availableStudentBooks}
                  student={activeStudent}
                  lessonLimit={activeLessonLimit}
                  selectedLesson={selectedStudentLesson}
                  onSelectBook={selectStudentBook}
                  onSelectLesson={setSelectedLessonId}
                />
              ) : null}
              {studentView === "homework" && activeStudent ? (
                <StudentHomework
                  book={activeBook}
                  books={availableStudentBooks}
                  lesson={selectedStudentLesson}
                  lessons={availableStudentLessons}
                  questions={selectedHomework}
                  answers={answers}
                  revealedAnswers={revealedAnswers}
                  completed={completedHomework}
                  onSelectBook={selectStudentBook}
                  onSelectLesson={setSelectedLessonId}
                  onAnswer={(questionId, answer) =>
                    setAnswers((current) => ({ ...current, [questionId]: answer }))
                  }
                  onReveal={revealAnswer}
                />
              ) : null}
            </>
          )}
        </main>
        {role === "student" ? (
          <nav className="mobile-student-navigation" aria-label="Navegação do aluno">
            {studentNavigation.map((item) => {
              const Icon = item.icon;
              const label = item.id === "lessons" ? "Lições" : item.label;
              const active = studentView === item.id;
              return (
                <button
                  type="button"
                  className={active ? "active" : ""}
                  aria-current={active ? "page" : undefined}
                  onClick={() => selectNavigation(item.id)}
                  key={item.id}
                >
                  <Icon />
                  <span>{label}</span>
                  {item.id === "homework" && selectedHomework.length > 0 ? (
                    <strong
                      className={`mobile-navigation-count ${homeworkComplete ? "complete" : ""}`}
                      aria-label={homeworkComplete
                        ? "Homework completed"
                        : `${remainingHomework} homework questions remaining`}
                    >
                      {homeworkComplete ? <Check /> : remainingHomework}
                    </strong>
                  ) : null}
                </button>
              );
            })}
          </nav>
        ) : null}
      </SidebarInset>

      <Sheet open={Boolean(managedStudent)} onOpenChange={(open) => !open && setManagedStudentId(null)}>
        <SheetContent className="student-sheet">
          {managedStudent ? (
            <>
              <SheetHeader>
                <div className="sheet-student-heading">
                  <div className="student-avatar large">{managedStudent.initials}</div>
                  <div>
                    <SheetTitle>{managedStudent.name}</SheetTitle>
                    <SheetDescription>{managedStudent.email}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="sheet-body">
                <section className="sheet-section">
                  <div className="section-title-row">
                    <div>
                      <h3>Progresso liberado</h3>
                    </div>
                    <ShieldCheck />
                  </div>
                  <BookAccessEditor
                    books={books}
                    lessons={lessons}
                    value={draftBookAccess}
                    onChange={setDraftBookAccess}
                    idPrefix="edit-student"
                  />
                  <Button className="w-full" onClick={saveStudentProgress}><Save /> Salvar progresso</Button>
                </section>

                <section className="sheet-section compact-section">
                  <div className="compact-stat"><span>Respostas armazenadas</span><strong>{managedStudent.answered}</strong></div>
                  <div className="compact-stat"><span>Último acesso</span><strong>{managedStudent.lastAccess}</strong></div>
                </section>

                <Button variant="outline" className="w-full" onClick={() => previewStudent(managedStudent)}>
                  <Eye /> Visualizar como este aluno
                </Button>

                <section className="danger-zone">
                  <div><strong>Limpeza permanente</strong></div>
                  <Button
                    variant="outline"
                    onClick={() => requestDelete({
                      kind: "answers",
                      targetId: managedStudent.id,
                      title: `Excluir respostas de ${managedStudent.name}?`,
                      description: "O cadastro e o progresso serão mantidos.",
                      affected: `${managedStudent.answered} respostas armazenadas`,
                      confirmation: "EXCLUIR",
                    })}
                    disabled={managedStudent.answered === 0}
                  >
                    <ArchiveX /> Excluir respostas
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => requestDelete({
                      kind: "student",
                      targetId: managedStudent.id,
                      title: `Excluir ${managedStudent.name} permanentemente?`,
                      description: "Cadastro, progresso e respostas serão removidos. A conta de acesso deve ser excluída separadamente no Firebase Authentication.",
                      affected: `1 cadastro · ${managedStudent.answered} respostas`,
                      confirmation: "EXCLUIR",
                    })}
                  >
                    <Trash2 /> Excluir aluno e seus dados
                  </Button>
                </section>
              </div>
              <SheetFooter />
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <BookDialog
        open={newBookOpen}
        onOpenChange={setNewBookOpen}
        title="Novo livro"
        submitLabel="Criar livro"
        onSubmit={addBook}
      />
      {editingBook ? (
        <BookDialog
          open
          onOpenChange={(open) => !open && setEditingBookId(null)}
          title="Editar livro"
          submitLabel="Salvar"
          book={editingBook}
          canDelete={books.length > 1}
          onDelete={() => {
            setEditingBookId(null);
            requestDelete({
              kind: "book",
              targetId: editingBook.id,
              title: `Excluir ${editingBook.title}?`,
              description: "Todas as lições, perguntas e áudios deste livro serão removidos.",
              affected: `${lessons.filter((lesson) => lesson.bookId === editingBook.id).length} lições`,
              confirmation: "EXCLUIR LIVRO",
            });
          }}
          onSubmit={updateBook}
        />
      ) : null}
      <NewLessonDialog
        open={newLessonOpen}
        onOpenChange={setNewLessonOpen}
        books={books}
        defaultBookId={selectedBook.id}
        onSubmit={addLesson}
      />
      {editingLesson ? (
        <EditLessonDialog
          open
          onOpenChange={(open) => !open && setEditingLessonKey(null)}
          lesson={editingLesson}
          books={books}
          onSubmit={updateLesson}
        />
      ) : null}
      {blockEditor && blockLesson ? (
        <BlockDialog
          open
          onOpenChange={(open) => !open && setBlockEditor(null)}
          value={
            blockEditor.index === null
              ? ""
              : lessonBlocks(blockLesson)[blockEditor.index]?.title ?? ""
          }
          section={
            blockEditor.index === null
              ? undefined
              : lessonBlocks(blockLesson)[blockEditor.index]
          }
          onSubmit={saveBlock}
        />
      ) : null}
      <NewHomeworkDialog
        key={`${newHomeworkOpen ? "open" : "closed"}-${selectedTeacherLesson?.id ?? "none"}`}
        open={newHomeworkOpen}
        onOpenChange={setNewHomeworkOpen}
        books={books}
        lessons={lessons}
        defaultBookId={selectedTeacherLesson?.bookId}
        defaultLessonId={selectedTeacherLesson?.id}
        onSubmit={addHomework}
      />
      {editingHomeworkLesson && editingHomeworkQuestion ? (
        <EditHomeworkDialog
          open
          onOpenChange={(open) => !open && setEditingHomework(null)}
          lesson={editingHomeworkLesson}
          question={editingHomeworkQuestion}
          onSubmit={updateHomework}
        />
      ) : null}
      {newStudentOpen ? (
        <NewStudentDialog
          open
          onOpenChange={setNewStudentOpen}
          books={books}
          lessons={lessons}
          onSubmit={addStudent}
        />
      ) : null}
      <AlertDialog open={Boolean(deleteRequest)} onOpenChange={(open) => !open && setDeleteRequest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="destructive-icon"><Trash2 /></div>
            <AlertDialogTitle>{deleteRequest?.title}</AlertDialogTitle>
            <AlertDialogDescription>{deleteRequest?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="affected-data">
            <span>Será excluído</span>
            <strong>{deleteRequest?.affected}</strong>
          </div>
          <div className="field-stack">
            <Label htmlFor="delete-confirmation">
              Digite {deleteRequest?.confirmation} para confirmar
            </Label>
            <Input
              id="delete-confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteConfirmation !== deleteRequest?.confirmation}
              onClick={confirmDelete}
            >
              {deleteRequest?.actionLabel ?? "Excluir permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster richColors position="top-center" />
    </SidebarProvider>
  );
}

function LoginScreen({
  accessError = "",
  onRetry,
}: {
  accessError?: string;
  onRetry?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(accessError);
  const [connectionIssue, setConnectionIssue] = useState(
    accessError.toLowerCase().includes("conexão")
      || accessError.toLowerCase().includes("network"),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setConnectionIssue(false);
    try {
      await signIn(email.trim(), password);
    } catch (error) {
      const timedOut = error instanceof Error
        && error.message === "firebase-operation-timeout";
      setConnectionIssue(timedOut);
      setMessage(timedOut
        ? "A conexão demorou mais que o esperado. Verifique a internet e tente novamente."
        : "E-mail ou senha inválidos.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      setMessage("Informe o e-mail para recuperar a senha.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      await requestPasswordReset(email.trim());
      toast.success("E-mail de recuperação enviado.");
    } catch {
      setMessage("Não foi possível enviar a recuperação de senha.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <Card className="auth-card">
        <CardContent>
          <Brand />
          <form onSubmit={submit} className="auth-form">
            <h1>Entrar</h1>
            <div className="field-stack">
              <Label htmlFor="login-email">E-mail</Label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="field-stack">
              <Label htmlFor="login-password">Senha</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {message ? <p className="auth-error">{message}</p> : null}
            {connectionIssue && onRetry ? (
              <Button type="button" variant="outline" onClick={onRetry}>
                <RotateCcw /> Tentar novamente
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Entrando..." : "Entrar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={resetPassword}
            >
              <Mail /> Esqueci minha senha
            </Button>
          </form>
        </CardContent>
      </Card>
      <Toaster richColors position="top-center" />
    </main>
  );
}

function AppLoading({ message = "Carregando..." }: { message?: string }) {
  return (
    <main className="auth-shell">
      <div className="app-loading">
        <Brand />
        <span className="loading-dot" />
        <p>{message}</p>
      </div>
    </main>
  );
}

function AccessState({
  title,
  message,
  onRetry,
  onExit,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  onExit: () => Promise<void>;
}) {
  return (
    <main className="auth-shell">
      <Card className="auth-card">
        <CardContent>
          <Brand />
          <div className="access-state">
            <LockKeyhole />
            <h1>{title}</h1>
            <p>{message}</p>
            <div className="access-state-actions">
              {onRetry ? (
                <Button onClick={onRetry}>
                  <RotateCcw /> Tentar novamente
                </Button>
              ) : null}
              <Button variant={onRetry ? "outline" : "default"} onClick={() => void onExit()}>
                <LogOut /> Sair
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function ConfigurationMissing() {
  return (
    <main className="auth-shell">
      <Card className="auth-card">
        <CardContent>
          <Brand />
          <div className="access-state">
            <LockKeyhole />
            <h1>Configuração pendente</h1>
            <p>O Firebase ainda não foi conectado à publicação.</p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`learning-brand ${compact ? "compact" : ""}`}>
      <Image
        src={`${publicBasePath}/logo-jenny.jpg`}
        alt="Talk to Jenny"
        width={1200}
        height={730}
        priority
        unoptimized
      />
      {!compact ? <span>Student Space</span> : null}
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="heading-actions">{actions}</div> : null}
    </header>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "blue",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "red" | "green";
}) {
  return (
    <Card className={`learning-metric ${tone}`}>
      <CardContent>
        <div className="metric-label"><span>{label}</span><span className="metric-icon"><Icon /></span></div>
        <strong>{value}</strong>
        <p>{detail}</p>
      </CardContent>
    </Card>
  );
}

function TeacherHome({
  books,
  lessons,
  students,
  totalAnswers,
  onNavigate,
  onNewLesson,
  onNewStudent,
  onOpenStudent,
}: {
  books: BookSummary[];
  lessons: LessonSummary[];
  students: Student[];
  totalAnswers: number;
  onNavigate: (view: TeacherView) => void;
  onNewLesson: () => void;
  onNewStudent: () => void;
  onOpenStudent: (student: Student) => void;
}) {
  const published = lessons.filter((lesson) => lesson.status === "published").length;
  const firstBook = books[0];
  const firstBookLessons = lessons.filter((lesson) => lesson.bookId === firstBook?.id);
  const firstBookPublished = firstBookLessons.filter(
    (lesson) => lesson.status === "published",
  ).length;
  return (
    <section className="content-section">
      <PageHeading
        title="Início"
        actions={<><Button variant="outline" onClick={onNewLesson}><Plus /> Nova lição</Button><Button onClick={onNewStudent}><UserPlus /> Novo aluno</Button></>}
      />
      <div className="metric-grid four">
        <MetricCard icon={BookOpenText} label="Lições" value={String(lessons.length)} detail={`${published} publicadas`} />
        <MetricCard icon={ClipboardCheck} label="Homeworks" value={String(lessons.reduce((sum, lesson) => sum + lesson.homeworkCount, 0))} detail="perguntas cadastradas" tone="red" />
        <MetricCard icon={Users} label="Alunos" value={String(students.length)} detail="todos ativos" tone="green" />
        <MetricCard icon={FileQuestion} label="Respostas" value={String(totalAnswers)} detail="histórico salvo" />
      </div>

      <div className="dashboard-grid">
        <Card className="panel-card content-progress-card">
          <CardHeader className="panel-header">
            <div><p className="panel-kicker">{firstBook?.title ?? "Livro 1"}</p><CardTitle>Conteúdo</CardTitle></div>
            <Button variant="ghost" onClick={() => onNavigate("content")}>Gerenciar <ArrowRight /></Button>
          </CardHeader>
          <CardContent>
            <div className="book-progress-visual">
              <div className="book-cover"><span>BOOK</span><strong>{firstBook?.order ?? 1}</strong><small>Talk to Jenny</small></div>
              <div className="book-progress-copy">
                <div className="progress-title"><strong>{firstBookPublished} de {firstBookLessons.length} lições publicadas</strong><span>{Math.round((firstBookPublished / Math.max(firstBookLessons.length, 1)) * 100)}%</span></div>
                <Progress value={(firstBookPublished / Math.max(firstBookLessons.length, 1)) * 100} />
                <Button onClick={() => onNavigate("content")}><PencilLine /> Continuar cadastro</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="panel-card">
          <CardHeader className="panel-header">
            <div><p className="panel-kicker">Acompanhamento</p><CardTitle>Progresso recente</CardTitle></div>
            <Button variant="ghost" onClick={() => onNavigate("students")}>Ver todos <ArrowRight /></Button>
          </CardHeader>
          <CardContent className="student-activity-list">
            {students.slice(0, 5).map((student) => (
              <button key={student.id} className="student-activity" onClick={() => onOpenStudent(student)}>
                <span className="student-avatar">{student.initials}</span>
                <span className="student-activity-copy"><strong>{student.name}</strong><small>Livro {student.currentBook} · Lesson {student.currentLesson}</small></span>
                <span className="student-activity-meta"><small>{student.lastAccess}</small><ChevronRight /></span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function TeacherContent({
  books,
  selectedBook,
  lessons,
  selectedLesson,
  onSelectBook,
  onSelectLesson,
  onNewBook,
  onEditBook,
  onNewLesson,
  onEditLesson,
  onNewHomework,
  onEditHomework,
  onDeleteHomework,
  onAddBlock,
  onEditBlock,
  onToggleStatus,
  onDelete,
}: {
  books: BookSummary[];
  selectedBook: BookSummary;
  lessons: LessonSummary[];
  selectedLesson?: LessonSummary;
  onSelectBook: (id: string) => void;
  onSelectLesson: (id: string) => void;
  onNewBook: () => void;
  onEditBook: () => void;
  onNewLesson: () => void;
  onEditLesson: (lesson: LessonSummary) => void;
  onNewHomework: () => void;
  onEditHomework: (lesson: LessonSummary, questionId: string) => void;
  onDeleteHomework: (lesson: LessonSummary, question: HomeworkQuestion) => void;
  onAddBlock: (lesson: LessonSummary) => void;
  onEditBlock: (lesson: LessonSummary, index: number) => void;
  onToggleStatus: (lesson: LessonSummary) => void;
  onDelete: (lesson: LessonSummary) => void;
}) {
  const [lessonMode, setLessonMode] = useState<"organize" | "preview">("organize");
  const [previewRole, setPreviewRole] = useState<"teacher" | "student">("teacher");
  const selectedBlocks = selectedLesson ? lessonBlocks(selectedLesson) : [];
  const previewContent = previewRole === "student"
    ? selectedBlocks.filter((section) => section.audience !== "teacher")
    : selectedBlocks;

  useEffect(() => {
    if (lessonMode !== "preview") return;

    function leavePresentationMode(event: KeyboardEvent) {
      if (event.key === "Escape") setLessonMode("organize");
    }

    document.body.classList.add("lesson-presentation-open");
    document.addEventListener("keydown", leavePresentationMode);

    return () => {
      document.body.classList.remove("lesson-presentation-open");
      document.removeEventListener("keydown", leavePresentationMode);
    };
  }, [lessonMode]);

  return (
    <section className="content-section">
      <PageHeading
        title="Conteúdo"
        actions={
          <>
            <Button variant="outline" onClick={onNewBook}><LibraryBig /> Novo livro</Button>
            <Button variant="outline" onClick={onNewHomework}><ClipboardCheck /> Novo homework</Button>
            <Button onClick={onNewLesson}><Plus /> Nova lição</Button>
          </>
        }
      />

      <Tabs defaultValue="lessons" className="content-tabs">
        <TabsList><TabsTrigger value="lessons">Lições</TabsTrigger><TabsTrigger value="homework">Homework</TabsTrigger></TabsList>
        <TabsContent value="lessons">
          <div className="content-management-grid">
            <Card className="panel-card lessons-list-card">
              <CardHeader className="book-admin-header">
                <div className="book-list-heading">
                  <div className="book-mini">{selectedBook.order}</div>
                  <div>
                    <Select value={selectedBook.id} onValueChange={onSelectBook}>
                      <SelectTrigger className="book-select" aria-label="Selecionar livro">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {books.map((book) => (
                          <SelectItem value={book.id} key={book.id}>{book.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p>{lessons.length} {lessons.length === 1 ? "lição" : "lições"}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onEditBook} aria-label="Editar livro">
                  <PencilLine />
                </Button>
              </CardHeader>
              <CardContent className="lesson-admin-list">
                {lessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    className={`lesson-admin-item ${selectedLesson?.id === lesson.id ? "active" : ""}`}
                    onClick={() => onSelectLesson(lesson.id)}
                  >
                    <span className="lesson-number">{lesson.order}</span>
                    <span><strong>{lesson.title}</strong><small>{lesson.sections.join(" · ")}</small></span>
                    <Badge variant={lesson.status === "published" ? "default" : "secondary"}>{lesson.status === "published" ? "Publicada" : "Rascunho"}</Badge>
                  </button>
                ))}
                {lessons.length === 0 ? (
                  <div className="admin-empty-state">
                    <BookOpenText />
                    <strong>Nenhuma lição</strong>
                    <Button size="sm" onClick={onNewLesson}><Plus /> Nova lição</Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className={`panel-card lesson-editor-card ${lessonMode === "preview" ? "presentation-mode" : ""}`}>
              {selectedLesson ? (
                <>
                  <CardHeader className="lesson-editor-header">
                    <div><p className="panel-kicker">{selectedBook.title} · Lesson {selectedLesson.order}</p><CardTitle>{selectedLesson.title}</CardTitle>{selectedLesson.subtitle ? <p>{selectedLesson.subtitle}</p> : null}</div>
                    <Button variant="ghost" size="icon" onClick={() => onEditLesson(selectedLesson)} aria-label="Editar lição"><PencilLine /></Button>
                  </CardHeader>
                  <CardContent>
                    <div className="lesson-status-line">
                      <Badge variant={selectedLesson.status === "published" ? "default" : "secondary"}>{selectedLesson.status === "published" ? "Publicada" : "Rascunho"}</Badge>
                      <span>{selectedLesson.homeworkCount} perguntas</span>
                    </div>

                    <div className="lesson-mode-toolbar">
                      <div className="lesson-mode-buttons">
                        <Button
                          variant={lessonMode === "organize" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setLessonMode("organize")}
                        >
                          <Layers3 /> Organizar
                        </Button>
                        <Button
                          variant={lessonMode === "preview" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setLessonMode("preview")}
                        >
                          <Eye /> Visualizar
                        </Button>
                      </div>
                      {lessonMode === "preview" ? (
                        <div className="preview-role-buttons">
                          <button
                            type="button"
                            className={previewRole === "teacher" ? "active" : ""}
                            onClick={() => setPreviewRole("teacher")}
                          >
                            Professora
                          </button>
                          <button
                            type="button"
                            className={previewRole === "student" ? "active" : ""}
                            onClick={() => setPreviewRole("student")}
                          >
                            Aluno
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {lessonMode === "organize" ? (
                      <>
                        <div className="block-list">
                          {selectedBlocks.map((section, index) => (
                            <div className={`content-block-row ${section.audience === "teacher" ? "teacher-only" : ""}`} key={section.id}>
                              <span className="drag-number">{String(index + 1).padStart(2, "0")}</span>
                              <span className="block-icon">{section.title.toLowerCase().includes("home") || section.title.toLowerCase().includes("exercise") ? <ClipboardCheck /> : section.audience === "teacher" ? <LockKeyhole /> : <Layers3 />}</span>
                              <span>
                                <strong>{section.title}</strong>
                                <small>
                                  {isStorySection(section) ? "História" : "Conteúdo normal"}
                                  {section.audience === "teacher" ? " · Somente professora" : " · Aluno e professora"}
                                </small>
                              </span>
                              {section.audioEmbedUrl ? (
                                <span className="audio-linked-label"><Volume2 /> Áudio</span>
                              ) : null}
                              <Button variant="ghost" size="icon" onClick={() => onEditBlock(selectedLesson, index)} aria-label={`Editar ${section.title}`}><PencilLine /></Button>
                            </div>
                          ))}
                          <button className="add-block-button" onClick={() => onAddBlock(selectedLesson)}><Plus /> Adicionar bloco</button>
                        </div>

                        <div className="audio-ready-row">
                          <div className="audio-ready-icon"><Headphones /></div>
                          <div>
                            <strong>Áudios do Audio.com</strong>
                            <p>
                              {lessonAudioCount(selectedLesson) > 0
                                ? `${lessonAudioCount(selectedLesson)} bloco(s) com áudio`
                                : "Nenhum áudio · adicione pelo lápis de cada bloco"}
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <article className="lesson-reader teacher-lesson-preview">
                        <header className="lesson-reader-header">
                          <div>
                            <p>{selectedBook.title} · Lesson {selectedLesson.order}</p>
                            <h2>{selectedLesson.title}</h2>
                            {selectedLesson.subtitle ? <span>{selectedLesson.subtitle}</span> : null}
                          </div>
                          <Badge variant="secondary">
                            {previewRole === "teacher" ? <GraduationCap /> : <BookCheck />}
                            {previewRole === "teacher" ? "Professora" : "Aluno"}
                          </Badge>
                        </header>
                        <LessonContentSections
                          key={`${selectedLesson.bookId}:${selectedLesson.id}:${previewRole}`}
                          lesson={{ ...selectedLesson, content: previewContent }}
                          showTeacherAudience={previewRole === "teacher"}
                        />
                      </article>
                    )}

                    <div className="editor-actions">
                      <Button variant="outline" onClick={() => onEditLesson(selectedLesson)}><PencilLine /> Editar lição</Button>
                      <Button onClick={() => onToggleStatus(selectedLesson)}>{selectedLesson.status === "published" ? <LockKeyhole /> : <Eye />}{selectedLesson.status === "published" ? "Voltar para rascunho" : "Publicar lição"}</Button>
                      <Button variant="ghost" className="delete-lesson" onClick={() => onDelete(selectedLesson)}><Trash2 /> Excluir</Button>
                    </div>
                  </CardContent>
                </>
              ) : (
                <CardContent className="lesson-editor-empty">
                  <BookOpenText />
                  <h2>{selectedBook.title}</h2>
                  <Button onClick={onNewLesson}><Plus /> Nova lição</Button>
                </CardContent>
              )}
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="homework">
          <Card className="panel-card">
            <CardHeader className="panel-header">
              <div>
                <p className="panel-kicker">{selectedBook.title}</p>
                <CardTitle>Homework</CardTitle>
              </div>
              <div className="homework-admin-actions">
                <Select value={selectedBook.id} onValueChange={onSelectBook}>
                  <SelectTrigger className="homework-book-select" aria-label="Selecionar livro">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {books.map((book) => (
                      <SelectItem value={book.id} key={book.id}>{book.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedLesson ? (
                  <Select value={selectedLesson.id} onValueChange={onSelectLesson}>
                    <SelectTrigger className="homework-lesson-select" aria-label="Selecionar lição">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {lessons.map((lesson) => (
                        <SelectItem value={lesson.id} key={lesson.id}>
                          Lesson {lesson.order} · {lesson.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <Button onClick={onNewHomework}><Plus /> Nova pergunta</Button>
              </div>
            </CardHeader>
            <CardContent>
              {selectedLesson && (selectedLesson.homework?.length ?? 0) > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Pergunta</TableHead>
                      <TableHead>Resposta correta</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedLesson.homework?.map((question) => (
                      <TableRow key={question.id}>
                        <TableCell><Badge variant="secondary">{question.category}</Badge></TableCell>
                        <TableCell className="homework-question-cell">{question.prompt}</TableCell>
                        <TableCell className="homework-answer-cell">{question.answer}</TableCell>
                        <TableCell className="text-right">
                          <div className="table-actions">
                            <Button variant="ghost" size="icon" onClick={() => onEditHomework(selectedLesson, question.id)} aria-label="Editar pergunta"><PencilLine /></Button>
                            <Button variant="ghost" size="icon" className="danger-icon-button" onClick={() => onDeleteHomework(selectedLesson, question)} aria-label="Excluir pergunta"><Trash2 /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="admin-empty-state homework-empty-state">
                  <ClipboardCheck />
                  <strong>Nenhuma pergunta</strong>
                  <Button size="sm" onClick={onNewHomework}><Plus /> Nova pergunta</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function TeacherStudents({
  books,
  lessons,
  students,
  onNewStudent,
  onOpenStudent,
}: {
  books: BookSummary[];
  lessons: LessonSummary[];
  students: Student[];
  onNewStudent: () => void;
  onOpenStudent: (student: Student) => void;
}) {
  function progressFor(student: Student) {
    const access = studentBookAccess(student, books, lessons);
    const book = books.find((item) => item.order === student.currentBook)
      ?? primaryBookForAccess(access, books);
    const lessonCount = lessons.filter((lesson) => lesson.bookId === book?.id).length;
    const lessonLimit = access[book?.id ?? ""] ?? student.currentLesson;
    return (lessonLimit / Math.max(lessonCount, 1)) * 100;
  }
  return (
    <section className="content-section">
      <PageHeading title="Alunos" actions={<Button onClick={onNewStudent}><UserPlus /> Novo aluno</Button>} />
      <Card className="panel-card student-table-card">
        <CardHeader className="panel-header"><CardTitle>{students.length} alunos ativos</CardTitle><Input className="student-search" placeholder="Buscar aluno" aria-label="Buscar aluno" /></CardHeader>
        <CardContent>
          <div className="desktop-table">
            <Table>
              <TableHeader><TableRow><TableHead>Aluno</TableHead><TableHead>Progresso liberado</TableHead><TableHead>Respostas</TableHead><TableHead>Último acesso</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell><div className="student-cell"><span className="student-avatar">{student.initials}</span><span><strong>{student.name}</strong><small>{student.email}</small></span></div></TableCell>
                    <TableCell><div className="progress-cell"><strong>{studentAccessSummary(student, books, lessons)}</strong><Progress value={progressFor(student)} /></div></TableCell>
                    <TableCell>{student.answered}</TableCell>
                    <TableCell>{student.lastAccess}</TableCell>
                    <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => onOpenStudent(student)}>Gerenciar</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mobile-student-list">
            {students.map((student) => (
              <button key={student.id} className="mobile-student-card" onClick={() => onOpenStudent(student)}>
                <span className="student-avatar">{student.initials}</span>
                <span><strong>{student.name}</strong><small>{studentAccessSummary(student, books, lessons)}</small><Progress value={progressFor(student)} /></span>
                <ChevronRight />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function TeacherData({
  lessons,
  students,
  totalAnswers,
  audioCount,
  trashItems,
  auditLogs,
  onDeleteAnswers,
  onDeleteStudent,
  onRestoreTrash,
  onPurgeTrash,
}: {
  lessons: LessonSummary[];
  students: Student[];
  totalAnswers: number;
  audioCount: number;
  trashItems: TrashItem[];
  auditLogs: AuditLog[];
  onDeleteAnswers: (student: Student) => void;
  onDeleteStudent: (student: Student) => void;
  onRestoreTrash: (item: TrashItem) => void;
  onPurgeTrash: (item: TrashItem) => void;
}) {
  return (
    <section className="content-section">
      <PageHeading title="Dados e armazenamento" />
      <div className="storage-overview">
        <Card className="storage-card"><CardContent><span className="storage-icon"><BookOpenText /></span><div><p>Conteúdo do curso</p><strong>{lessons.length} lições</strong><small>estimativa: menos de 1 MB</small></div></CardContent></Card>
        <Card className="storage-card"><CardContent><span className="storage-icon red"><FileQuestion /></span><div><p>Respostas de alunos</p><strong>{totalAnswers} respostas</strong><small>estimativa: menos de 1 MB</small></div></CardContent></Card>
        <Card className="storage-card"><CardContent><span className="storage-icon muted"><Headphones /></span><div><p>Áudios</p><strong>{audioCount} blocos</strong><small>{audioCount > 0 ? "com áudio disponível" : "nenhum áudio cadastrado"}</small></div></CardContent></Card>
      </div>

      <Card className="panel-card trash-card">
        <CardHeader className="panel-header">
          <div>
            <p className="panel-kicker">Proteção contra exclusões acidentais</p>
            <CardTitle>Lixeira temporária</CardTitle>
          </div>
          <Badge variant="secondary"><ShieldCheck /> Retenção de 10 dias</Badge>
        </CardHeader>
        <CardContent>
          {trashItems.length > 0 ? (
            <div className="trash-list">
              {trashItems.map((item) => {
                const days = trashDaysRemaining(item);
                return (
                  <div className="trash-item" key={item.id}>
                    <span className="trash-item-icon">
                      {item.kind === "lesson" ? <BookOpenText /> : <ClipboardCheck />}
                    </span>
                    <div className="trash-item-copy">
                      <strong>{item.kind === "lesson" ? "Lição" : "Pergunta"} · {item.label}</strong>
                      <small>{item.bookTitle} · Lesson {item.lessonOrder} · excluído em {formatProtectionDate(item.deletedAt)}</small>
                      <span>{days > 0 ? `${days} dia${days === 1 ? "" : "s"} para restaurar` : "Prazo concluído"}</span>
                    </div>
                    <div className="trash-item-actions">
                      <Button variant="outline" size="sm" onClick={() => onRestoreTrash(item)}>
                        <RotateCcw /> Restaurar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="delete-text"
                        disabled={days > 0}
                        title={days > 0 ? "Disponível após o prazo de 10 dias" : undefined}
                        onClick={() => onPurgeTrash(item)}
                      >
                        <Trash2 /> Excluir definitivamente
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="trash-empty">
              <ArchiveX />
              <div><strong>A lixeira está vazia</strong><span>Perguntas e lições excluídas aparecerão aqui por 10 dias.</span></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="panel-card protection-history-card">
        <CardHeader className="panel-header">
          <div><p className="panel-kicker">Registro de segurança</p><CardTitle>Histórico recente</CardTitle></div>
          <History />
        </CardHeader>
        <CardContent>
          {auditLogs.length > 0 ? (
            <div className="protection-history-list">
              {auditLogs.slice(0, 12).map((log) => (
                <div key={log.id}>
                  <span>{auditActionLabel(log.action)}</span>
                  <strong>{log.kind === "lesson" ? "Lição" : "Pergunta"} · {log.label}</strong>
                  <small>{formatProtectionDate(log.occurredAt)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="protection-history-empty">As próximas exclusões e restaurações serão registradas aqui.</p>
          )}
        </CardContent>
      </Card>

      <Card className="panel-card data-cleanup-card">
        <CardHeader className="panel-header"><div><p className="panel-kicker">Limpeza seletiva</p><CardTitle>Dados por aluno</CardTitle></div><Badge variant="secondary"><ShieldCheck /> Somente Jenny</Badge></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Aluno</TableHead><TableHead>Livro</TableHead><TableHead>Respostas</TableHead><TableHead className="text-right">Ações permanentes</TableHead></TableRow></TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell><div className="student-cell"><span className="student-avatar">{student.initials}</span><span><strong>{student.name}</strong><small>{student.email}</small></span></div></TableCell>
                  <TableCell>Livro {student.currentBook}</TableCell>
                  <TableCell>{student.answered}</TableCell>
                  <TableCell className="data-actions"><Button variant="outline" size="sm" disabled={student.answered === 0} onClick={() => onDeleteAnswers(student)}><ArchiveX /> Limpar respostas</Button><Button variant="ghost" size="sm" className="delete-text" onClick={() => onDeleteStudent(student)}><Trash2 /> Excluir aluno</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </section>
  );
}

function trashDaysRemaining(item: TrashItem) {
  const remaining = new Date(item.purgeAfter).getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / 86_400_000));
}

function formatProtectionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function auditActionLabel(action: AuditLog["action"]) {
  if (action === "restored") return "Restaurado";
  if (action === "purged") return "Excluído definitivamente";
  return "Movido para a lixeira";
}

function StudentHome({
  student,
  book,
  lesson,
  lessonLimit,
  progress,
  homeworkRemaining,
  homeworkComplete,
  onOpenLesson,
  onOpenHomework,
  onOpenLessonNumber,
}: {
  student: Student;
  book?: BookSummary;
  lesson?: LessonSummary;
  lessonLimit: number;
  progress: number;
  homeworkRemaining: number;
  homeworkComplete: boolean;
  onOpenLesson: () => void;
  onOpenHomework: () => void;
  onOpenLessonNumber: (lessonOrder: number) => void;
}) {
  const practiceUrl = safePracticeUrl(book?.practiceUrl);
  const practiceLabel = book?.practiceLabel?.trim() || "Play and practice";
  return (
    <section className="content-section">
      <PageHeading eyebrow="My learning space" title={`Hi, ${student.name.split(" ")[0]}!`} description="Continue exactly where you left off." />
      <div className="student-home-grid">
        <Card className="continue-card">
          <CardContent>
            <div className="continue-copy">
              <Badge>Book {book?.order ?? student.currentBook}</Badge>
              <p className="continue-kicker">Continue studying</p>
              <h2>Lesson {lessonLimit}{lesson?.title ? ` · ${lesson.title}` : ""}</h2>
              <p>Review the lesson, listen to the words and complete your homework.</p>
              <Button onClick={onOpenLesson}><Play /> Open lesson</Button>
            </div>
            <div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><span><strong>{progress}%</strong><small>Book {book?.order ?? student.currentBook}</small></span></div>
          </CardContent>
        </Card>

        <Card className="homework-callout">
          <CardContent>
            <span className="homework-icon"><ClipboardCheck /></span>
            <div>
              <p>Homework</p>
              <h3>Lesson {lesson?.order ?? lessonLimit}</h3>
              <span className={homeworkComplete ? "homework-status-complete" : ""}>
                {(lesson?.homework?.length ?? 0) === 0
                  ? "No questions yet"
                  : homeworkComplete
                    ? "Completed"
                    : `${homeworkRemaining} to answer`}
              </span>
            </div>
            <Button variant="outline" onClick={onOpenHomework}>Start <ArrowRight /></Button>
          </CardContent>
        </Card>
      </div>

      <div className={`student-overview-grid ${practiceUrl ? "" : "single"}`}>
        <Card className="panel-card unlocked-card"><CardHeader className="panel-header"><div><p className="panel-kicker">Available now</p><CardTitle>Your lessons</CardTitle></div><Button variant="ghost" onClick={onOpenLesson}>See all <ArrowRight /></Button></CardHeader><CardContent className="unlocked-list">{Array.from({ length: lessonLimit }, (_, index) => index + 1).slice(-3).map((lessonOrder) => <button key={lessonOrder} onClick={() => onOpenLessonNumber(lessonOrder)}><span className="lesson-number">{lessonOrder}</span><span><strong>Lesson {lessonOrder}</strong><small>{lessonOrder === lessonLimit ? "Current lesson" : "Available for review"}</small></span><CheckCircle2 /></button>)}</CardContent></Card>
        {practiceUrl ? (
          <Card className="practice-card">
            <CardContent>
              <Gamepad2 />
              <p>Practice</p>
              <h3>Words, audio and activities.</h3>
              <Button asChild>
                <a href={practiceUrl} target="_blank" rel="noopener noreferrer">
                  {practiceLabel} <ExternalLink />
                </a>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}

function LessonContentSections({
  lesson,
  showTeacherAudience = false,
}: {
  lesson: LessonSummary;
  showTeacherAudience?: boolean;
}) {
  const sections = lesson.content ?? [];
  const [activeAudioSection, setActiveAudioSection] = useState<string | null>(null);
  const [revealedStories, setRevealedStories] = useState<Record<string, boolean>>({});

  if (sections.length === 0) {
    return (
      <div className="placeholder-lesson-content">
        <span><BookOpenText /></span>
        <h3>{lesson.sections.join(" · ")}</h3>
      </div>
    );
  }

  return (
    <div className="learning-sections">
      {sections.map((section) => {
        const storySection = isStorySection(section);
        const readingSection = storySection || section.title.startsWith("Song");
        const teacherOnly = section.audience === "teacher";
        const audioEmbedUrl = safeAudioComEmbedUrl(section.audioEmbedUrl ?? "");
        const hasAudio = Boolean(audioEmbedUrl);
        const audioIsActive = hasAudio && activeAudioSection === section.id;
        const storyTextIsVisible = !storySection
          || !hasAudio
          || revealedStories[section.id] === true;

        function toggleAudio() {
          if (!hasAudio) return;
          setActiveAudioSection((current) => current === section.id ? null : section.id);
        }

        return (
          <section
            className={`learning-section ${readingSection ? "reading" : ""} ${storySection ? "story" : ""} ${teacherOnly ? "teacher-only" : ""}`}
            key={section.id}
          >
            {showTeacherAudience && teacherOnly ? (
              <span className="teacher-only-label"><LockKeyhole /> Somente professora</span>
            ) : null}

            <div className="learning-section-title-row">
              <h3>{section.title}</h3>
              {hasAudio && !storySection ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={audioIsActive ? "section-audio-button active" : "section-audio-button"}
                  onClick={toggleAudio}
                  aria-label={audioIsActive ? `Parar áudio de ${section.title}` : `Ouvir ${section.title}`}
                  title={audioIsActive ? "Parar áudio" : "Ouvir este bloco"}
                >
                  <Volume2 />
                </Button>
              ) : null}
            </div>

            {storySection && hasAudio ? (
              <div className="story-listening-panel">
                <div className="story-listening-copy">
                  <span><Headphones /></span>
                  <div>
                    <strong>Ouça antes de ler</strong>
                    <small>Escute a história e revele o texto quando estiver pronto.</small>
                  </div>
                </div>
                <div className="story-listening-actions">
                  <Button
                    type="button"
                    variant={audioIsActive ? "secondary" : "outline"}
                    size="sm"
                    onClick={toggleAudio}
                  >
                    <Volume2 /> {audioIsActive ? "Parar áudio" : "Ouvir história"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRevealedStories((current) => ({
                      ...current,
                      [section.id]: !current[section.id],
                    }))}
                  >
                    {storyTextIsVisible ? <EyeOff /> : <Eye />}
                    {storyTextIsVisible ? "Ocultar texto" : "Mostrar texto"}
                  </Button>
                </div>
              </div>
            ) : null}

            {audioIsActive && audioEmbedUrl ? (
              <div className="audio-embed-shell">
                <iframe
                  src={audioComAutoplayUrl(audioEmbedUrl)}
                  title={`Áudio de ${section.title}`}
                  allow="autoplay"
                  loading="lazy"
                />
              </div>
            ) : null}

            {storyTextIsVisible ? (
              <div className="learning-items">
                {section.items.map((item, itemIndex) => (
                  <div className="learning-item" key={`${section.id}-${item.english}-${itemIndex}`}>
                    <div>
                      <strong>{item.english}</strong>
                      {item.portuguese ? <span>{item.portuguese}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="story-text-hidden" role="status">
                <EyeOff />
                <strong>Texto oculto</strong>
                <span>Ouça a história e use “Mostrar texto” quando quiser acompanhar a leitura.</span>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function StudentLessons({
  lessons,
  book,
  books,
  student,
  lessonLimit,
  selectedLesson,
  onSelectBook,
  onSelectLesson,
}: {
  lessons: LessonSummary[];
  book?: BookSummary;
  books: BookSummary[];
  student: Student;
  lessonLimit: number;
  selectedLesson?: LessonSummary;
  onSelectBook: (id: string) => void;
  onSelectLesson: (id: string) => void;
}) {
  const [mobileLessonFocused, setMobileLessonFocused] = useState(false);
  const previousScrollPosition = useRef(0);
  const lessonReaderColumn = useRef<HTMLDivElement>(null);
  const practiceUrl = safePracticeUrl(book?.practiceUrl);
  const practiceLabel = book?.practiceLabel?.trim() || "Play and practice";
  const selectedIsAvailable = Boolean(
    selectedLesson
      && selectedLesson.order <= lessonLimit
      && selectedLesson.status === "published",
  );
  useEffect(() => {
    if (!mobileLessonFocused) return;
    if (!window.matchMedia("(max-width: 899px)").matches) return;
    window.requestAnimationFrame(() => {
      lessonReaderColumn.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [mobileLessonFocused, selectedLesson?.id]);

  function selectLesson(lessonId: string) {
    onSelectLesson(lessonId);
    if (window.matchMedia("(max-width: 899px)").matches) {
      previousScrollPosition.current = window.scrollY;
      setMobileLessonFocused(true);
    }
  }

  function showAllLessons() {
    setMobileLessonFocused(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: previousScrollPosition.current,
        behavior: "smooth",
      });
    });
  }

  return (
    <section className="content-section">
      <PageHeading
        eyebrow={`Book ${book?.order ?? student.currentBook}`}
        title="My lessons"
        description={`You can study up to Lesson ${lessonLimit}.`}
        actions={(
          <StudentBookSelector books={books} value={book?.id ?? ""} onChange={onSelectBook} />
        )}
      />
      {practiceUrl ? (
        <Card className="book-practice-banner">
          <CardContent>
            <span className="practice-banner-icon"><Gamepad2 /></span>
            <div><p>Book practice</p><strong>Words, audio and activities</strong></div>
            <Button asChild variant="outline">
              <a href={practiceUrl} target="_blank" rel="noopener noreferrer">
                {practiceLabel} <ExternalLink />
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <div className={"student-lessons-layout" + (mobileLessonFocused ? " mobile-lesson-focused" : "")}>
        <Card className="lesson-picker-card">
          <CardHeader><CardTitle>Book {book?.order ?? student.currentBook}</CardTitle><p>{Math.min(lessonLimit, lessons.filter((lesson) => lesson.status === "published").length)} lessons available</p></CardHeader>
          <CardContent className="student-lesson-picker">
            {lessons.map((lesson) => {
              const unlocked = lesson.order <= lessonLimit && lesson.status === "published";
              return (
                <button key={lesson.id} disabled={!unlocked} className={selectedLesson?.id === lesson.id ? "active" : ""} onClick={() => unlocked && selectLesson(lesson.id)}>
                  <span className="lesson-number">{lesson.order}</span>
                  <span><strong>Lesson {lesson.order}</strong><small>{lesson.title}</small></span>
                  {unlocked ? <ChevronRight /> : <LockKeyhole />}
                </button>
              );
            })}
          </CardContent>
        </Card>

        {selectedIsAvailable && selectedLesson ? (
          <div className="lesson-reader-column" ref={lessonReaderColumn}>
            <button
              type="button"
              className="focused-lessons-back"
              onClick={showAllLessons}
            >
              <ChevronLeft />
              Voltar para todas as lições
            </button>
          <article className="lesson-reader">
            <header className="lesson-reader-header">
              <div><p>Book {book?.order ?? student.currentBook} · Lesson {selectedLesson.order}</p><h2>{selectedLesson.title}</h2>{selectedLesson.subtitle ? <span>{selectedLesson.subtitle}</span> : null}</div>
              <Badge variant="secondary"><BookCheck /> Available</Badge>
            </header>

            <LessonContentSections
              key={`${selectedLesson.bookId}:${selectedLesson.id}`}
              lesson={selectedLesson}
            />
          </article>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StudentHomework({
  book,
  books,
  lesson,
  lessons,
  questions,
  answers,
  revealedAnswers,
  completed,
  onSelectBook,
  onSelectLesson,
  onAnswer,
  onReveal,
}: {
  book?: BookSummary;
  books: BookSummary[];
  lesson?: LessonSummary;
  lessons: LessonSummary[];
  questions: HomeworkQuestion[];
  answers: Record<string, string>;
  revealedAnswers: Record<string, boolean>;
  completed: number;
  onSelectBook: (bookId: string) => void;
  onSelectLesson: (lessonId: string) => void;
  onAnswer: (questionId: string, answer: string) => void;
  onReveal: (questionId: string) => void;
}) {
  return (
    <section className="content-section homework-page">
      <PageHeading
        eyebrow={`Book ${book?.order ?? 1} · Lesson ${lesson?.order ?? 1}`}
        title="Homework"
        actions={(
          <StudentBookSelector books={books} value={book?.id ?? ""} onChange={onSelectBook} />
        )}
      />
      <div className="homework-lesson-switcher">
        <div className="homework-switcher-copy">
          <span><BookOpenText /></span>
          <div>
            <Label htmlFor="student-homework-lesson">Choose a lesson</Label>
            <small className={questions.length > 0 && completed === questions.length ? "complete" : ""}>
              {questions.length === 0
                ? "No homework added to this lesson yet"
                : completed === questions.length
                  ? "Homework completed"
                  : `${questions.length - completed} questions remaining`}
            </small>
          </div>
        </div>
        {lesson ? (
          <Select value={lesson.id} onValueChange={onSelectLesson}>
            <SelectTrigger
              id="student-homework-lesson"
              className="student-homework-lesson-select"
              aria-label="Choose a lesson"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lessons.map((availableLesson) => (
                <SelectItem value={availableLesson.id} key={availableLesson.id}>
                  Lesson {availableLesson.order} · {availableLesson.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      <Card className="homework-progress-card"><CardContent><div><span>Progress</span><strong>{completed} of {questions.length} checked</strong></div><Progress value={(completed / Math.max(questions.length, 1)) * 100} /></CardContent></Card>
      <div className="question-list">
        {questions.map((question, index) => {
          const revealed = Boolean(revealedAnswers[question.id]);
          const isCorrect = revealed && normalizeAnswer(answers[question.id]) === normalizeAnswer(question.answer);
          return (
            <Card className={`question-card ${revealed ? (isCorrect ? "correct" : "compare") : ""}`} key={question.id}>
              <CardContent>
                <div className="question-heading"><span>{String(index + 1).padStart(2, "0")}</span><div><Badge variant="secondary">{question.category}</Badge><h3>{question.prompt}</h3></div></div>
                <div className="answer-field"><Label htmlFor={`answer-${question.id}`}>Your answer</Label><Textarea id={`answer-${question.id}`} value={answers[question.id] ?? ""} onChange={(event) => onAnswer(question.id, event.target.value)} placeholder="Type your answer in English..." disabled={revealed} /><Button onClick={() => onReveal(question.id)} disabled={revealed}>{revealed ? <Check /> : <ClipboardCheck />}{revealed ? "Checked" : "Check answer"}</Button></div>
                {revealed ? (
                  <div className="answer-comparison">
                    <div className="comparison-status">{isCorrect ? <CheckCircle2 /> : <Eye />}<span><strong>{isCorrect ? "Great job!" : "Compare your answer"}</strong><small>{isCorrect ? "Your answer matches the key." : "Notice the words and word order."}</small></span></div>
                    <div className="correct-answer"><span>Correct answer</span><strong>{question.answer}</strong></div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
        {questions.length === 0 ? (
          <Card className="question-card">
            <CardContent>
              <div className="placeholder-lesson-content">
                <ClipboardCheck />
                <h3>Nenhum homework disponível</h3>
                <p>Escolha outra lição no seletor acima.</p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}

function BookDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  book,
  canDelete = false,
  onDelete,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  book?: BookSummary;
  canDelete?: boolean;
  onDelete?: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form key={book?.id ?? "new-book"} onSubmit={onSubmit}>
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <div className="dialog-form">
            <div className="field-stack">
              <Label htmlFor="book-title">Nome</Label>
              <Input id="book-title" name="title" defaultValue={book?.title} placeholder="Ex.: Livro 2" autoFocus />
            </div>
            <div className="field-stack">
              <Label htmlFor="book-practice-url">Link de prática</Label>
              <Input id="book-practice-url" name="practiceUrl" type="url" defaultValue={book?.practiceUrl} placeholder="https://..." />
            </div>
            <div className="field-stack">
              <Label htmlFor="book-practice-label">Texto do botão</Label>
              <Input id="book-practice-label" name="practiceLabel" defaultValue={book?.practiceLabel} placeholder="Ex.: Play and practice" />
            </div>
          </div>
          <DialogFooter className="dialog-footer-split">
            {onDelete ? <Button type="button" variant="ghost" className="delete-text" disabled={!canDelete} onClick={onDelete}><Trash2 /> Excluir</Button> : <span />}
            <span className="dialog-footer-actions"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit"><Save /> {submitLabel}</Button></span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewLessonDialog({
  open,
  onOpenChange,
  books,
  defaultBookId,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  books: BookSummary[];
  defaultBookId: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader><DialogTitle>Nova lição</DialogTitle></DialogHeader>
          <div className="dialog-form">
            <div className="field-stack"><Label htmlFor="lesson-title">Título</Label><Input id="lesson-title" name="title" placeholder="Ex.: Daily routines" autoFocus /></div>
            <div className="field-stack"><Label htmlFor="lesson-subtitle">Resumo</Label><Input id="lesson-subtitle" name="subtitle" placeholder="Assunto principal" /></div>
            <div className="field-stack"><Label htmlFor="lesson-book">Livro</Label><select id="lesson-book" name="book" className="native-select" defaultValue={defaultBookId}>{books.map((book) => <option value={book.id} key={book.id}>{book.title}</option>)}</select></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit"><Plus /> Criar lição</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditLessonDialog({
  open,
  onOpenChange,
  lesson,
  books,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: LessonSummary;
  books: BookSummary[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form key={lesson.id} onSubmit={onSubmit}>
          <DialogHeader><DialogTitle>Editar lição</DialogTitle></DialogHeader>
          <div className="dialog-form">
            <div className="field-stack"><Label htmlFor="edit-lesson-title">Título</Label><Input id="edit-lesson-title" name="title" defaultValue={lesson.title} autoFocus /></div>
            <div className="field-stack"><Label htmlFor="edit-lesson-subtitle">Resumo</Label><Input id="edit-lesson-subtitle" name="subtitle" defaultValue={lesson.subtitle} /></div>
            <div className="form-grid two">
              <div className="field-stack"><Label htmlFor="edit-lesson-book">Livro</Label><select id="edit-lesson-book" name="book" className="native-select" defaultValue={lesson.bookId}>{books.map((book) => <option value={book.id} key={book.id}>{book.title}</option>)}</select></div>
              <div className="field-stack"><Label htmlFor="edit-lesson-order">Número</Label><Input id="edit-lesson-order" name="order" type="number" min="1" defaultValue={lesson.order} /></div>
            </div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit"><Save /> Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BlockDialog({
  open,
  onOpenChange,
  value,
  section,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  section?: LearningSection;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="block-dialog-content">
        <form className="block-dialog-layout" onSubmit={onSubmit}>
          <DialogHeader><DialogTitle>{value ? "Editar bloco" : "Novo bloco"}</DialogTitle></DialogHeader>
          <div className="dialog-form block-dialog-scroll">
            <div className="field-stack"><Label htmlFor="block-name">Nome</Label><Input id="block-name" name="name" defaultValue={value} placeholder="Ex.: Vocabulary" autoFocus /></div>
            <div className="field-stack">
              <Label htmlFor="block-audience">Quem pode visualizar</Label>
              <select
                id="block-audience"
                name="audience"
                className="native-select"
                defaultValue={section?.audience === "teacher" ? "teacher" : "student"}
              >
                <option value="student">Aluno e professora</option>
                <option value="teacher">Somente professora</option>
              </select>
              <small className="field-help">
                Blocos exclusivos da professora são salvos em uma área separada e protegida.
              </small>
            </div>
            <div className="field-stack">
              <Label htmlFor="block-kind">Tipo de bloco</Label>
              <select
                id="block-kind"
                name="kind"
                className="native-select"
                defaultValue={section && isStorySection(section) ? "story" : "standard"}
              >
                <option value="standard">Conteúdo normal</option>
                <option value="story">História — ouvir antes de revelar o texto</option>
              </select>
              <small className="field-help">
                Histórias com áudio começam com o texto oculto. Sem áudio, o texto aparece normalmente.
              </small>
            </div>
            <div className="form-grid two">
              <div className="field-stack">
                <Label htmlFor="block-english">Inglês</Label>
                <Textarea
                  id="block-english"
                  name="english"
                  rows={8}
                  defaultValue={section?.items.map((item) => item.english).join("\n")}
                />
                <small className="field-help">Um item por linha</small>
              </div>
              <div className="field-stack">
                <Label htmlFor="block-portuguese">Português</Label>
                <Textarea
                  id="block-portuguese"
                  name="portuguese"
                  rows={8}
                  defaultValue={section?.items.map((item) => item.portuguese).join("\n")}
                />
                <small className="field-help">Uma tradução por linha</small>
              </div>
            </div>
            <div className="field-stack">
              <Label htmlFor="block-audio-embed">Áudio do bloco (opcional)</Label>
              <Textarea
                id="block-audio-embed"
                name="audioEmbed"
                className="block-audio-embed-input"
                rows={3}
                defaultValue={section?.audioEmbedUrl ?? ""}
                placeholder="No Audio.com, use Share → Embed e cole aqui o código copiado"
              />
              <small className="field-help">
                Aceita o código completo do player ou um endereço https://audio.com/embed/. Se ficar vazio, nenhum ícone de áudio aparecerá.
              </small>
            </div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit"><Save /> Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewHomeworkDialog({
  open,
  onOpenChange,
  books,
  lessons,
  defaultBookId,
  defaultLessonId,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  books: BookSummary[];
  lessons: LessonSummary[];
  defaultBookId?: string;
  defaultLessonId?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const defaultLesson = lessons.find((lesson) =>
    lesson.id === defaultLessonId && lesson.bookId === defaultBookId,
  );
  const [bookId, setBookId] = useState(defaultLesson?.bookId ?? books[0]?.id ?? "");
  const [lessonId, setLessonId] = useState(defaultLesson?.id ?? lessons[0]?.id ?? "");

  const selectedBookId = books.some((book) => book.id === bookId)
    ? bookId
    : books[0]?.id ?? "";
  const bookLessons = lessons
    .filter((lesson) => lesson.bookId === selectedBookId)
    .sort((a, b) => a.order - b.order);
  const selectedLessonId = bookLessons.some((lesson) => lesson.id === lessonId)
    ? lessonId
    : bookLessons[0]?.id ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader><DialogTitle>Nova pergunta</DialogTitle></DialogHeader>
          <div className="dialog-form">
            <div className="form-grid two">
              <div className="field-stack">
                <Label htmlFor="homework-book">Livro</Label>
                <select
                  id="homework-book"
                  name="book"
                  className="native-select"
                  value={selectedBookId}
                  onChange={(event) => {
                    const nextBookId = event.target.value;
                    setBookId(nextBookId);
                    setLessonId(
                      lessons
                        .filter((lesson) => lesson.bookId === nextBookId)
                        .sort((a, b) => a.order - b.order)[0]?.id ?? "",
                    );
                  }}
                >
                  {books.map((book) => <option value={book.id} key={book.id}>{book.title}</option>)}
                </select>
              </div>
              <div className="field-stack">
                <Label htmlFor="homework-lesson">Lição</Label>
                <select id="homework-lesson" name="lesson" className="native-select" value={selectedLessonId} onChange={(event) => setLessonId(event.target.value)}>
                  {bookLessons.map((lesson) => <option value={lesson.id} key={lesson.id}>Lesson {lesson.order} · {lesson.title}</option>)}
                </select>
              </div>
            </div>
            <div className="field-stack"><Label htmlFor="homework-category">Categoria</Label><Input id="homework-category" name="category" placeholder="Ex.: Verbs, Vocabulary, Expressions" /></div>
            <div className="field-stack"><Label htmlFor="homework-question">Pergunta</Label><Textarea id="homework-question" name="question" placeholder="Ex.: Eu gosto de estudar inglês." /></div>
            <div className="field-stack"><Label htmlFor="homework-answer">Resposta correta</Label><Textarea id="homework-answer" name="answer" placeholder="Ex.: I like to study English." /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit"><Plus /> Adicionar pergunta</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditHomeworkDialog({
  open,
  onOpenChange,
  lesson,
  question,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: LessonSummary;
  question: HomeworkQuestion;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader><DialogTitle>Editar pergunta</DialogTitle></DialogHeader>
          <div className="dialog-form">
            <div className="field-stack">
              <Label>Lição</Label>
              <Input value={`Lesson ${lesson.order} · ${lesson.title}`} readOnly />
            </div>
            <div className="field-stack">
              <Label htmlFor="edit-homework-category">Categoria</Label>
              <Input id="edit-homework-category" name="category" defaultValue={question.category} />
            </div>
            <div className="field-stack">
              <Label htmlFor="edit-homework-question">Pergunta</Label>
              <Textarea id="edit-homework-question" name="question" defaultValue={question.prompt} />
            </div>
            <div className="field-stack">
              <Label htmlFor="edit-homework-answer">Resposta correta</Label>
              <Textarea id="edit-homework-answer" name="answer" defaultValue={question.answer} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit"><Save /> Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StudentBookSelector({
  books,
  value,
  onChange,
}: {
  books: BookSummary[];
  value: string;
  onChange: (bookId: string) => void;
}) {
  return (
    <div className="student-book-switcher">
      <Label htmlFor="student-book-switcher">Choose a book</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id="student-book-switcher"
          className="student-book-select"
          aria-label="Choose a book"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {books.map((book) => (
            <SelectItem value={book.id} key={book.id}>
              Book {book.order}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BookAccessEditor({
  books,
  lessons,
  value,
  onChange,
  idPrefix,
}: {
  books: BookSummary[];
  lessons: LessonSummary[];
  value: Record<string, number>;
  onChange: (value: Record<string, number>) => void;
  idPrefix: string;
}) {
  function toggleBook(book: BookSummary, checked: boolean) {
    if (checked) {
      const firstLesson = lessons
        .filter((lesson) => lesson.bookId === book.id)
        .sort((a, b) => a.order - b.order)[0];
      onChange({ ...value, [book.id]: firstLesson?.order ?? 1 });
      return;
    }
    const nextValue = { ...value };
    delete nextValue[book.id];
    onChange(nextValue);
  }

  return (
    <div className="book-access-editor">
      <div className="book-access-heading">
        <strong>Livros liberados</strong>
        <span>Marque somente os livros que este aluno poderá acessar. O mais avançado será aberto primeiro.</span>
      </div>
      <div className="book-access-list">
        {books.map((book) => {
          const checked = value[book.id] !== undefined;
          const bookLessons = lessons
            .filter((lesson) => lesson.bookId === book.id)
            .sort((a, b) => a.order - b.order);
          const fallbackLesson = bookLessons[0]?.order ?? 1;
          return (
            <div className={`book-access-row ${checked ? "selected" : ""}`} key={book.id}>
              <label className="book-access-choice" htmlFor={`${idPrefix}-${book.id}`}>
                <input
                  id={`${idPrefix}-${book.id}`}
                  name="bookAccess"
                  type="checkbox"
                  value={book.id}
                  checked={checked}
                  onChange={(event) => toggleBook(book, event.target.checked)}
                />
                <span>
                  <strong>Livro {book.order}</strong>
                  <small>{book.title}</small>
                </span>
              </label>
              <div className="book-access-limit">
                <Label htmlFor={`${idPrefix}-${book.id}-lesson`}>Liberar até</Label>
                <select
                  id={`${idPrefix}-${book.id}-lesson`}
                  name={`bookLesson:${book.id}`}
                  className="native-select"
                  value={String(value[book.id] ?? fallbackLesson)}
                  onChange={(event) => onChange({
                    ...value,
                    [book.id]: Number(event.target.value),
                  })}
                  disabled={!checked}
                >
                  {bookLessons.length > 0 ? bookLessons.map((lesson) => (
                    <option value={lesson.order} key={lesson.id}>Lesson {lesson.order}</option>
                  )) : (
                    <option value="1">Lesson 1</option>
                  )}
                </select>
              </div>
            </div>
          );
        })}
      </div>
      {Object.keys(value).length === 0 ? (
        <p className="book-access-warning">Selecione pelo menos um livro.</p>
      ) : (
        <p className="book-access-summary">
          {Object.keys(value).length} {Object.keys(value).length === 1 ? "livro liberado" : "livros liberados"}
        </p>
      )}
    </div>
  );
}

function NewStudentDialog({
  open,
  onOpenChange,
  books,
  lessons,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  books: BookSummary[];
  lessons: LessonSummary[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [bookAccess, setBookAccess] = useState<Record<string, number>>(() => {
    const firstBook = books[0];
    const firstLesson = lessons
      .filter((lesson) => lesson.bookId === firstBook?.id)
      .sort((a, b) => a.order - b.order)[0];
    return firstBook ? { [firstBook.id]: firstLesson?.order ?? 1 } : {};
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="student-dialog-content">
        <form className="student-dialog-layout" onSubmit={onSubmit}>
          <DialogHeader><DialogTitle>Novo aluno</DialogTitle></DialogHeader>
          <div className="dialog-form student-dialog-scroll">
            <div className="student-account-note">
              <div>
                <strong>Crie primeiro a conta de acesso no Firebase</strong>
                <span>Depois copie o UID gerado e conclua o perfil aqui.</span>
              </div>
              <Button asChild type="button" variant="outline">
                <a href={firebaseAuthUsersUrl} target="_blank" rel="noopener noreferrer">
                  Abrir Authentication <ExternalLink />
                </a>
              </Button>
            </div>
            <div className="field-stack">
              <Label htmlFor="student-uid">UID da conta no Firebase</Label>
              <Input id="student-uid" name="uid" placeholder="Cole o UID completo" autoFocus required />
            </div>
            <div className="field-stack"><Label htmlFor="student-name">Nome</Label><Input id="student-name" name="name" placeholder="Nome completo" required /></div>
            <div className="field-stack"><Label htmlFor="student-email">E-mail de acesso</Label><Input id="student-email" name="email" type="email" placeholder="aluno@email.com" required /></div>
            <BookAccessEditor
              books={books}
              lessons={lessons}
              value={bookAccess}
              onChange={setBookAccess}
              idPrefix="new-student"
            />
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit"><UserPlus /> Vincular aluno</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function normalizeAnswer(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function practiceFieldsFrom(form: FormData): Pick<BookSummary, "practiceUrl" | "practiceLabel"> | null {
  const rawUrl = String(form.get("practiceUrl") ?? "").trim();
  const practiceUrl = safePracticeUrl(rawUrl);
  if (rawUrl && !practiceUrl) return null;
  const rawLabel = String(form.get("practiceLabel") ?? "").trim();
  return {
    practiceUrl,
    practiceLabel: practiceUrl ? rawLabel || "Play and practice" : "",
  };
}

function safePracticeUrl(value = "") {
  if (!value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeAudioComEmbedUrl(value = "") {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const iframeSource = trimmed.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
  const candidate = (iframeSource ?? trimmed).replaceAll("&amp;", "&").trim();

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (
      url.protocol !== "https:"
      || hostname !== "audio.com"
      || !url.pathname.startsWith("/embed/")
    ) {
      return "";
    }
    url.searchParams.delete("autoplay");
    return url.toString();
  } catch {
    return "";
  }
}

function audioComAutoplayUrl(value: string) {
  const safeUrl = safeAudioComEmbedUrl(value);
  if (!safeUrl) return "";
  const url = new URL(safeUrl);
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("footer", "false");
  return url.toString();
}

function isStorySection(section?: LearningSection) {
  if (!section) return false;
  if (section.kind === "story") return true;
  if (section.kind === "standard") return false;
  const normalizedTitle = section.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase();
  return normalizedTitle.includes("lets talk")
    || normalizedTitle.includes("story")
    || normalizedTitle.includes("historia");
}

function lessonAudioCount(lesson: LessonSummary) {
  return (lesson.content ?? []).filter(
    (section) => Boolean(safeAudioComEmbedUrl(section.audioEmbedUrl ?? "")),
  ).length;
}
