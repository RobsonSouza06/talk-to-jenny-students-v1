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
  ExternalLink,
  FileQuestion,
  Gamepad2,
  GraduationCap,
  Headphones,
  Home,
  Layers3,
  LibraryBig,
  LockKeyhole,
  LogOut,
  Mail,
  PencilLine,
  Play,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
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
  buildAudioTargetId,
  createPreviewAudioAsset,
  isAudioAvailableToStudent,
  type AudioAsset,
} from "@/lib/audio-storage";
import {
  firebaseAuthUsersUrl,
  isFirebaseConfigured,
} from "@/lib/firebase-client";
import {
  clearStudentAttempts,
  createStudentProfile,
  deleteBookPermanently,
  deleteHomeworkQuestionPermanently,
  deleteLessonPermanently,
  deleteStudentPermanently,
  loadStudentAttempts,
  loadStudentWorkspace,
  loadTeacherWorkspace,
  moveLesson,
  observeAuth,
  requestPasswordReset,
  saveBook,
  saveLesson,
  saveStudentAttempt,
  signIn,
  signOutCurrentUser,
  updateStudentProgress,
  type FirebaseSession,
  type StudentAttempt,
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
type BlockEditorState = {
  lessonId: string;
  index: number | null;
};
type DeleteRequest = {
  kind: "answers" | "student" | "homework" | "lesson" | "book";
  targetId: string;
  parentId?: string;
  title: string;
  description: string;
  affected: string;
};

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

export function LearningPlatform() {
  const [session, setSession] = useState<FirebaseSession | null>(null);
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }
    return observeAuth((nextSession, error) => {
      setSession(nextSession);
      setAuthError(error?.message ?? "");
      setAuthLoading(false);
    });
  }, []);

  if (!isFirebaseConfigured) {
    return <ConfigurationMissing />;
  }
  if (authLoading) {
    return <AppLoading />;
  }
  if (!session) {
    return <LoginScreen accessError={authError} />;
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
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [activeStudentId, setActiveStudentId] = useState(
    accountRole === "student" ? session.user.uid : "",
  );
  const [managedStudentId, setManagedStudentId] = useState<string | null>(null);
  const [draftBook, setDraftBook] = useState("1");
  const [draftLesson, setDraftLesson] = useState("1");
  const [selectedBookId, setSelectedBookId] = useState("book-1");
  const [selectedLessonId, setSelectedLessonId] = useState("lesson-1");
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [newLessonOpen, setNewLessonOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [blockEditor, setBlockEditor] = useState<BlockEditorState | null>(null);
  const [newHomeworkOpen, setNewHomeworkOpen] = useState(false);
  const [editingHomework, setEditingHomework] = useState<{
    lessonId: string;
    questionId: string;
  } | null>(null);
  const [newStudentOpen, setNewStudentOpen] = useState(false);
  const [audioDialogOpen, setAudioDialogOpen] = useState(false);
  const [audioAssets, setAudioAssets] = useState<Record<string, AudioAsset>>({});
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
        const data = accountRole === "teacher"
          ? await loadTeacherWorkspace()
          : await loadStudentWorkspace(session.user.uid);
        if (cancelled) return;
        setBooks(data.books);
        setLessons(data.lessons);
        setStudents(data.students);
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
      } catch (error) {
        if (!cancelled) {
          setWorkspaceError(
            error instanceof Error ? error.message : "Não foi possível carregar os dados.",
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
  }, [accountRole, session.user.uid]);

  if (workspaceLoading) {
    return <AppLoading />;
  }
  if (workspaceError) {
    return (
      <AccessState
        title="Não foi possível abrir o aplicativo"
        message={workspaceError}
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
  const activeBook = books.find((book) => book.order === activeStudent?.currentBook) ?? books[0];
  const activeBookLessons = lessons
    .filter((lesson) => lesson.bookId === activeBook?.id)
    .sort((a, b) => a.order - b.order);
  const currentStudentLesson =
    activeBookLessons.find((lesson) => lesson.order === activeStudent?.currentLesson)
    ?? activeBookLessons[0];
  const availableStudentLessons = activeBookLessons.filter(
    (lesson) =>
      lesson.order <= (activeStudent?.currentLesson ?? 0)
      && lesson.status === "published",
  );
  const selectedStudentLesson =
    activeBookLessons.find((lesson) => lesson.id === selectedLessonId)
    ?? currentStudentLesson
    ?? activeBookLessons[0];
  const editingBook = books.find((book) => book.id === editingBookId);
  const editingLesson = lessons.find((lesson) => lesson.id === editingLessonId);
  const editingHomeworkLesson = lessons.find(
    (lesson) => lesson.id === editingHomework?.lessonId,
  );
  const editingHomeworkQuestion = editingHomeworkLesson?.homework?.find(
    (question) => question.id === editingHomework?.questionId,
  );
  const blockLesson = lessons.find((lesson) => lesson.id === blockEditor?.lessonId);
  const draftBookRecord = books.find((book) => book.order === Number(draftBook));
  const draftBookLessons = lessons
    .filter((lesson) => lesson.bookId === draftBookRecord?.id)
    .sort((a, b) => a.order - b.order);
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
  const availableAudioCount = Object.values(audioAssets).filter(
    isAudioAvailableToStudent,
  ).length;

  const studentProgress = activeStudent
    ? Math.min(
        100,
        Math.round(
          (activeStudent.currentLesson
            / Math.max(
              activeBook?.lessonCount ?? 0,
              activeBookLessons.length,
              activeStudent.currentLesson,
              1,
            ))
            * 100,
        ),
      )
    : 0;

  function findStudentLesson(student: Student) {
    const book = books.find((item) => item.order === student.currentBook);
    const bookLessons = lessons
      .filter((lesson) => lesson.bookId === book?.id)
      .sort((a, b) => a.order - b.order);
    return (
      bookLessons.find((lesson) => lesson.order === student.currentLesson)
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
      if (lesson) setSelectedLessonId(lesson.id);
      if (activeStudent) void loadPreviewAttemptState(activeStudent.id);
    }
  }

  function openStudent(student: Student) {
    setManagedStudentId(student.id);
    setDraftBook(String(student.currentBook));
    setDraftLesson(String(student.currentLesson));
  }

  async function saveStudentProgress() {
    if (!managedStudent || !draftBookRecord) return;
    const nextBook = Number(draftBook);
    const nextLesson = Number(draftLesson);
    try {
      await updateStudentProgress({
        studentId: managedStudent.id,
        bookId: draftBookRecord.id,
        currentBook: nextBook,
        currentLesson: nextLesson,
      });
      setLessons((current) =>
        current.map((lesson) =>
          lesson.bookId === draftBookRecord.id && lesson.order <= nextLesson
            ? { ...lesson, status: "published" }
            : lesson,
        ),
      );
      setStudents((current) =>
        current.map((student) =>
          student.id === managedStudent.id
            ? { ...student, currentBook: nextBook, currentLesson: nextLesson }
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
    if (lesson) setSelectedLessonId(lesson.id);
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
        lesson.id !== editingLesson.id
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
          lesson.id === editingLesson.id ? updatedLesson : lesson,
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
      setEditingLessonId(null);
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
    const sections = [...blockLesson.sections];
    if (blockEditor.index === null) sections.push(name);
    else sections[blockEditor.index] = name;
    const englishLines = String(form.get("english") ?? "").split(/\r?\n/);
    const portugueseLines = String(form.get("portuguese") ?? "").split(/\r?\n/);
    const itemCount = Math.max(englishLines.length, portugueseLines.length);
    const items = Array.from({ length: itemCount }, (_, index) => ({
      english: englishLines[index]?.trim() ?? "",
      portuguese: portugueseLines[index]?.trim() ?? "",
      audioText: englishLines[index]?.trim() || undefined,
    })).filter((item) => item.english || item.portuguese);
    const content: LearningSection[] = blockLesson.sections.map(
      (section, index) =>
        blockLesson.content?.[index] ?? {
          id: `section-${index + 1}`,
          title: section,
          items: [],
        },
    );
    const contentIndex = blockEditor.index ?? content.length;
    const previousContent = content[contentIndex];
    content[contentIndex] = {
      id: previousContent?.id ?? `section-${Date.now()}`,
      title: name,
      items,
    };
    const updatedLesson = { ...blockLesson, sections, content };
    try {
      await saveLesson(updatedLesson);
      setLessons((current) =>
        current.map((lesson) =>
          lesson.id === blockLesson.id ? updatedLesson : lesson,
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
    const lessonId = String(form.get("lesson") ?? "");
    const category = String(form.get("category") ?? "Homework").trim() || "Homework";
    const question = String(form.get("question") ?? "").trim();
    const answer = String(form.get("answer") ?? "").trim();
    if (!lessonId || !question || !answer) {
      toast.error("Preencha a lição, a pergunta e a resposta correta.");
      return;
    }
    const lesson = lessons.find((item) => item.id === lessonId);
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
        current.map((item) => (item.id === lessonId ? updatedLesson : item)),
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
          lesson.id === updatedLesson.id ? updatedLesson : lesson,
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
    const initialBookId = String(form.get("book") ?? books[0]?.id);
    const initialBook = books.find((book) => book.id === initialBookId) ?? books[0];
    const initialLesson = Number(form.get("lesson") ?? 1);
    if (!uid || uid.length > 128 || uid.includes("/") || !name || !email) {
      toast.error("Preencha o UID, o nome e o e-mail da conta criada no Firebase.");
      return;
    }
    try {
      const student = await createStudentProfile({
        uid,
        name,
        email,
        bookId: initialBook?.id ?? "",
        currentBook: initialBook?.order ?? 1,
        currentLesson: initialLesson,
      });
      setLessons((current) =>
        current.map((lesson) =>
          lesson.bookId === initialBook?.id && lesson.order <= initialLesson
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

  async function confirmPermanentDelete() {
    if (!deleteRequest || deleteConfirmation !== "EXCLUIR") return;
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
          (item) => item.id === deleteRequest.parentId,
        );
        if (!lesson) throw new Error("Lição não encontrada.");
        await deleteHomeworkQuestionPermanently(
          lesson,
          deleteRequest.targetId,
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
            item.id === lesson.id ? updatedLesson : item,
          ),
        );
        setEditingHomework(null);
        toast.success("Pergunta excluída permanentemente.");
      }
      if (deleteRequest.kind === "lesson") {
        const deletedLesson = lessons.find(
          (lesson) => lesson.id === deleteRequest.targetId,
        );
        if (deletedLesson) {
          await deleteLessonPermanently(
            deletedLesson.bookId,
            deleteRequest.targetId,
          );
        }
        setLessons((current) =>
          current.filter((lesson) => lesson.id !== deleteRequest.targetId),
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
        setAudioAssets((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([, asset]) => asset.lessonId !== deleteRequest.targetId,
            ),
          ),
        );
        const nextLesson = lessons
          .filter(
            (lesson) =>
              lesson.id !== deleteRequest.targetId
              && lesson.bookId === deletedLesson?.bookId,
          )
          .sort((a, b) => a.order - b.order)[0];
        if (nextLesson) setSelectedLessonId(nextLesson.id);
        toast.success("Lição e homework relacionados foram excluídos.");
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
        setAudioAssets((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([, asset]) => asset.bookId !== deleteRequest.targetId,
            ),
          ),
        );
        if (nextBook) setSelectedBookId(nextBook.id);
        if (nextLesson) setSelectedLessonId(nextLesson.id);
        setEditingBookId(null);
        toast.success("Livro e conteúdo relacionado foram excluídos.");
      }
      setDeleteRequest(null);
      setDeleteConfirmation("");
    } catch {
      toast.error("Não foi possível concluir a exclusão.");
    }
  }

  async function toggleLessonStatus(lessonId: string) {
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson) return;
    const updatedLesson: LessonSummary = {
      ...lesson,
      status: lesson.status === "published" ? "draft" : "published",
    };
    try {
      await saveLesson(updatedLesson);
      setLessons((current) =>
        current.map((item) => (item.id === lessonId ? updatedLesson : item)),
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

  function addAudio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTeacherLesson) return;
    const form = new FormData(event.currentTarget);
    const targetId = String(form.get("target") ?? "");
    const file = form.get("audio");

    if (!targetId || !(file instanceof File) || file.size === 0) {
      toast.error("Escolha o local e o arquivo de áudio.");
      return;
    }
    if (!file.type.startsWith("audio/")) {
      toast.error("O arquivo precisa ser um áudio.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("O áudio deve ter no máximo 15 MB.");
      return;
    }

    const replacingExisting = Boolean(audioAssets[targetId]);
    const previousAsset = audioAssets[targetId];
    if (previousAsset?.provider === "preview" && previousAsset.playbackUrl) {
      URL.revokeObjectURL(previousAsset.playbackUrl);
    }

    const asset = createPreviewAudioAsset({
      bookId: selectedTeacherLesson.bookId,
      lessonId: selectedTeacherLesson.id,
      targetId,
      file,
    });
    setAudioAssets((current) => ({ ...current, [targetId]: asset }));
    if (!replacingExisting) {
      setLessons((current) =>
        current.map((lesson) =>
          lesson.id === selectedTeacherLesson.id
            ? { ...lesson, audioCount: lesson.audioCount + 1 }
            : lesson,
        ),
      );
    }
    setAudioDialogOpen(false);
    toast.success("Áudio pronto. O botão já aparece para o aluno.");
    event.currentTarget.reset();
  }

  function playAudio(asset: AudioAsset) {
    if (!isAudioAvailableToStudent(asset) || !asset.playbackUrl) return;
    const audio = new Audio(asset.playbackUrl);
    audio.play().catch(() => toast.error("Não foi possível reproduzir este áudio."));
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
                  onEditLesson={(lesson) => setEditingLessonId(lesson.id)}
                  onNewHomework={() => setNewHomeworkOpen(true)}
                  onEditHomework={(lessonId, questionId) =>
                    setEditingHomework({ lessonId, questionId })
                  }
                  onDeleteHomework={(lesson, question) =>
                    requestDelete({
                      kind: "homework",
                      targetId: question.id,
                      parentId: lesson.id,
                      title: "Excluir pergunta?",
                      description: "A pergunta e as respostas salvas serão removidas.",
                      affected: "1 pergunta",
                    })
                  }
                  onAddAudio={() => setAudioDialogOpen(true)}
                  onAddBlock={(lesson) =>
                    setBlockEditor({ lessonId: lesson.id, index: null })
                  }
                  onEditBlock={(lesson, index) =>
                    setBlockEditor({ lessonId: lesson.id, index })
                  }
                  onToggleStatus={toggleLessonStatus}
                  onDelete={(lesson) =>
                    requestDelete({
                      kind: "lesson",
                      targetId: lesson.id,
                      title: `Excluir Lesson ${lesson.order}?`,
                      description:
                        "A lição, seus blocos e todas as perguntas do homework serão removidos. O conteúdo dos outros livros e lições será mantido.",
                      affected: `1 lição · ${lesson.homeworkCount} perguntas`,
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
                  student={activeStudent}
                  selectedLesson={selectedStudentLesson}
                  onSelectLesson={setSelectedLessonId}
                  audioAssets={audioAssets}
                  onPlayAudio={playAudio}
                />
              ) : null}
              {studentView === "homework" && activeStudent ? (
                <StudentHomework
                  book={activeBook}
                  lesson={selectedStudentLesson}
                  lessons={availableStudentLessons}
                  questions={selectedHomework}
                  answers={answers}
                  revealedAnswers={revealedAnswers}
                  completed={completedHomework}
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
                  <div className="form-grid two">
                    <div className="field-stack">
                      <Label>Livro atual</Label>
                      <Select
                        value={draftBook}
                        onValueChange={(value) => {
                          setDraftBook(value);
                          const book = books.find((item) => item.order === Number(value));
                          const firstLesson = lessons
                            .filter((lesson) => lesson.bookId === book?.id)
                            .sort((a, b) => a.order - b.order)[0];
                          setDraftLesson(String(firstLesson?.order ?? 1));
                        }}
                      >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {books.map((book) => (
                            <SelectItem value={String(book.order)} key={book.id}>
                              {book.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="field-stack">
                      <Label>Até a lição</Label>
                      <Select value={draftLesson} onValueChange={setDraftLesson}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {draftBookLessons.map((lesson) => (
                            <SelectItem value={String(lesson.order)} key={lesson.id}>
                              Lesson {lesson.order}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
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
          onOpenChange={(open) => !open && setEditingLessonId(null)}
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
              : blockLesson.sections[blockEditor.index] ?? ""
          }
          section={
            blockEditor.index === null
              ? undefined
              : blockLesson.content?.[blockEditor.index]
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
      <NewStudentDialog
        open={newStudentOpen}
        onOpenChange={setNewStudentOpen}
        books={books}
        lessons={lessons}
        onSubmit={addStudent}
      />
      {selectedTeacherLesson ? (
        <NewAudioDialog
          open={audioDialogOpen}
          onOpenChange={setAudioDialogOpen}
          lesson={selectedTeacherLesson}
          onSubmit={addAudio}
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
            <Label htmlFor="delete-confirmation">Digite EXCLUIR para confirmar</Label>
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
              disabled={deleteConfirmation !== "EXCLUIR"}
              onClick={confirmPermanentDelete}
            >
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster richColors position="top-center" />
    </SidebarProvider>
  );
}

function LoginScreen({ accessError = "" }: { accessError?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(accessError);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      await signIn(email.trim(), password);
    } catch {
      setMessage("E-mail ou senha inválidos.");
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

function AppLoading() {
  return (
    <main className="auth-shell">
      <div className="app-loading">
        <Brand />
        <span className="loading-dot" />
      </div>
    </main>
  );
}

function AccessState({
  title,
  message,
  onExit,
}: {
  title: string;
  message: string;
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
            <Button onClick={() => void onExit()}>
              <LogOut /> Sair
            </Button>
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
  onAddAudio,
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
  onEditHomework: (lessonId: string, questionId: string) => void;
  onDeleteHomework: (lesson: LessonSummary, question: HomeworkQuestion) => void;
  onAddAudio: () => void;
  onAddBlock: (lesson: LessonSummary) => void;
  onEditBlock: (lesson: LessonSummary, index: number) => void;
  onToggleStatus: (id: string) => void;
  onDelete: (lesson: LessonSummary) => void;
}) {
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

            <Card className="panel-card lesson-editor-card">
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

                    <div className="block-list">
                      {selectedLesson.sections.map((section, index) => (
                        <div className="content-block-row" key={`${selectedLesson.id}-${index}`}>
                          <span className="drag-number">{String(index + 1).padStart(2, "0")}</span>
                          <span className="block-icon">{section.toLowerCase().includes("home") || section.toLowerCase().includes("exercise") ? <ClipboardCheck /> : <Layers3 />}</span>
                          <span><strong>{section}</strong></span>
                          <Button variant="ghost" size="icon" onClick={() => onEditBlock(selectedLesson, index)} aria-label={`Editar ${section}`}><PencilLine /></Button>
                        </div>
                      ))}
                      <button className="add-block-button" onClick={() => onAddBlock(selectedLesson)}><Plus /> Adicionar bloco</button>
                    </div>

                    <div className="audio-ready-row">
                      <div className="audio-ready-icon"><Headphones /></div>
                      <div><strong>Áudios</strong><p>{selectedLesson.audioCount > 0 ? `${selectedLesson.audioCount} arquivo(s)` : "Nenhum áudio"}</p></div>
                      <Button variant="outline" onClick={onAddAudio}><Upload /> Adicionar áudio</Button>
                    </div>

                    <div className="editor-actions">
                      <Button variant="outline" onClick={() => onEditLesson(selectedLesson)}><PencilLine /> Editar lição</Button>
                      <Button onClick={() => onToggleStatus(selectedLesson.id)}>{selectedLesson.status === "published" ? <LockKeyhole /> : <Eye />}{selectedLesson.status === "published" ? "Voltar para rascunho" : "Publicar lição"}</Button>
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
                            <Button variant="ghost" size="icon" onClick={() => onEditHomework(selectedLesson.id, question.id)} aria-label="Editar pergunta"><PencilLine /></Button>
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
    const book = books.find((item) => item.order === student.currentBook);
    const lessonCount = lessons.filter((lesson) => lesson.bookId === book?.id).length;
    return (student.currentLesson / Math.max(lessonCount, 1)) * 100;
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
                    <TableCell><div className="progress-cell"><strong>Livro {student.currentBook} · Lesson {student.currentLesson}</strong><Progress value={progressFor(student)} /></div></TableCell>
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
                <span><strong>{student.name}</strong><small>Livro {student.currentBook} · Lesson {student.currentLesson}</small><Progress value={progressFor(student)} /></span>
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
  onDeleteAnswers,
  onDeleteStudent,
}: {
  lessons: LessonSummary[];
  students: Student[];
  totalAnswers: number;
  audioCount: number;
  onDeleteAnswers: (student: Student) => void;
  onDeleteStudent: (student: Student) => void;
}) {
  return (
    <section className="content-section">
      <PageHeading title="Dados e armazenamento" />
      <div className="storage-overview">
        <Card className="storage-card"><CardContent><span className="storage-icon"><BookOpenText /></span><div><p>Conteúdo do curso</p><strong>{lessons.length} lições</strong><small>estimativa: menos de 1 MB</small></div></CardContent></Card>
        <Card className="storage-card"><CardContent><span className="storage-icon red"><FileQuestion /></span><div><p>Respostas de alunos</p><strong>{totalAnswers} respostas</strong><small>estimativa: menos de 1 MB</small></div></CardContent></Card>
        <Card className="storage-card"><CardContent><span className="storage-icon muted"><Headphones /></span><div><p>Áudios</p><strong>{audioCount} arquivos</strong><small>{audioCount > 0 ? "prontos para os alunos" : "nenhum arquivo cadastrado"}</small></div></CardContent></Card>
      </div>

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

function StudentHome({
  student,
  book,
  lesson,
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
              <h2>Lesson {student.currentLesson}{lesson?.title ? ` · ${lesson.title}` : ""}</h2>
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
              <h3>Lesson {lesson?.order ?? student.currentLesson}</h3>
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
        <Card className="panel-card unlocked-card"><CardHeader className="panel-header"><div><p className="panel-kicker">Available now</p><CardTitle>Your lessons</CardTitle></div><Button variant="ghost" onClick={onOpenLesson}>See all <ArrowRight /></Button></CardHeader><CardContent className="unlocked-list">{Array.from({ length: student.currentLesson }, (_, index) => index + 1).slice(-3).map((lessonOrder) => <button key={lessonOrder} onClick={() => onOpenLessonNumber(lessonOrder)}><span className="lesson-number">{lessonOrder}</span><span><strong>Lesson {lessonOrder}</strong><small>{lessonOrder === student.currentLesson ? "Current lesson" : "Available for review"}</small></span><CheckCircle2 /></button>)}</CardContent></Card>
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

function StudentLessons({
  lessons,
  book,
  student,
  selectedLesson,
  onSelectLesson,
  audioAssets,
  onPlayAudio,
}: {
  lessons: LessonSummary[];
  book?: BookSummary;
  student: Student;
  selectedLesson?: LessonSummary;
  onSelectLesson: (id: string) => void;
  audioAssets: Record<string, AudioAsset>;
  onPlayAudio: (asset: AudioAsset) => void;
}) {
  const [mobileLessonFocused, setMobileLessonFocused] = useState(false);
  const previousScrollPosition = useRef(0);
  const lessonReaderColumn = useRef<HTMLDivElement>(null);
  const practiceUrl = safePracticeUrl(book?.practiceUrl);
  const practiceLabel = book?.practiceLabel?.trim() || "Play and practice";
  const selectedIsAvailable = Boolean(
    selectedLesson
      && selectedLesson.order <= student.currentLesson
      && selectedLesson.status === "published",
  );
  const availableLessonAudio = selectedLesson ? getAudioTargets(selectedLesson).flatMap((target) => {
    const asset = audioAssets[target.id];
    return isAudioAvailableToStudent(asset) ? [{ target, asset }] : [];
  }) : [];

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
      <PageHeading eyebrow={`Book ${student.currentBook}`} title="My lessons" description={`You can study up to Lesson ${student.currentLesson}.`} />
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
          <CardHeader><CardTitle>Book {book?.order ?? student.currentBook}</CardTitle><p>{Math.min(student.currentLesson, lessons.filter((lesson) => lesson.status === "published").length)} lessons available</p></CardHeader>
          <CardContent className="student-lesson-picker">
            {lessons.map((lesson) => {
              const unlocked = lesson.order <= student.currentLesson && lesson.status === "published";
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

            {(selectedLesson.content?.length ?? 0) > 0 ? (
              <div className="learning-sections">
                {(selectedLesson.content ?? []).map((section) => {
                  const readingSection =
                    section.title === "Let’s Talk" || section.title.startsWith("Song");
                  return (
                    <section
                      className={`learning-section ${readingSection ? "reading" : ""}`}
                      key={section.id}
                    >
                      <h3>{section.title}</h3>
                      <div className="learning-items">
                        {section.items.map((item) => {
                          const targetId = buildAudioTargetId(
                            selectedLesson.id,
                            section.id,
                            item.english,
                          );
                          const audioAsset = audioAssets[targetId];
                          return (
                            <div className="learning-item" key={`${section.id}-${item.english}`}>
                              <div>
                                <strong>{item.english}</strong>
                                {item.portuguese ? <span>{item.portuguese}</span> : null}
                              </div>
                              {isAudioAvailableToStudent(audioAsset) ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onPlayAudio(audioAsset)}
                                  aria-label={`Ouvir ${item.english}`}
                                >
                                  <Volume2 />
                                </Button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="placeholder-lesson-content">
                <span><BookOpenText /></span>
                <h3>{selectedLesson.sections.join(" · ")}</h3>
                {availableLessonAudio.length > 0 ? (
                  <div className="lesson-audio-list">
                    {availableLessonAudio.map(({ target, asset }) => (
                      <Button variant="outline" key={target.id} onClick={() => onPlayAudio(asset)}>
                        <Volume2 /> {target.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </article>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StudentHomework({
  book,
  lesson,
  lessons,
  questions,
  answers,
  revealedAnswers,
  completed,
  onSelectLesson,
  onAnswer,
  onReveal,
}: {
  book?: BookSummary;
  lesson?: LessonSummary;
  lessons: LessonSummary[];
  questions: HomeworkQuestion[];
  answers: Record<string, string>;
  revealedAnswers: Record<string, boolean>;
  completed: number;
  onSelectLesson: (lessonId: string) => void;
  onAnswer: (questionId: string, answer: string) => void;
  onReveal: (questionId: string) => void;
}) {
  return (
    <section className="content-section homework-page">
      <PageHeading eyebrow={`Book ${book?.order ?? 1} · Lesson ${lesson?.order ?? 1}`} title="Homework" />
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

function NewAudioDialog({
  open,
  onOpenChange,
  lesson,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: LessonSummary;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const targets = getAudioTargets(lesson);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Adicionar áudio</DialogTitle>
          </DialogHeader>
          <div className="dialog-form">
            <div className="field-stack">
              <Label htmlFor="audio-target">Palavra, frase ou bloco</Label>
              <select id="audio-target" name="target" className="native-select" defaultValue={targets[0]?.id}>
                {targets.map((target) => (
                  <option value={target.id} key={target.id}>{target.label}</option>
                ))}
              </select>
            </div>
            <div className="field-stack">
              <Label htmlFor="audio-file">Arquivo</Label>
              <Input id="audio-file" name="audio" type="file" accept="audio/*" required />
              <small className="field-help">MP3, M4A, WAV, OGG ou WebM · máximo 15 MB</small>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit"><Upload /> Salvar áudio</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader><DialogTitle>{value ? "Editar bloco" : "Novo bloco"}</DialogTitle></DialogHeader>
          <div className="dialog-form">
            <div className="field-stack"><Label htmlFor="block-name">Nome</Label><Input id="block-name" name="name" defaultValue={value} placeholder="Ex.: Vocabulary" autoFocus /></div>
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
  defaultLessonId,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  books: BookSummary[];
  lessons: LessonSummary[];
  defaultLessonId?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const defaultLesson = lessons.find((lesson) => lesson.id === defaultLessonId);
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
  const [bookId, setBookId] = useState(books[0]?.id ?? "");
  const selectedBookId = books.some((book) => book.id === bookId)
    ? bookId
    : books[0]?.id ?? "";
  const bookLessons = lessons
    .filter((lesson) => lesson.bookId === selectedBookId)
    .sort((a, b) => a.order - b.order);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader><DialogTitle>Novo aluno</DialogTitle></DialogHeader>
          <div className="dialog-form">
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
            <div className="form-grid two">
              <div className="field-stack"><Label htmlFor="student-book">Livro</Label><select id="student-book" name="book" className="native-select" value={selectedBookId} onChange={(event) => setBookId(event.target.value)}>{books.map((book) => <option value={book.id} key={book.id}>{book.title}</option>)}</select></div>
              <div className="field-stack"><Label htmlFor="student-lesson">Lição</Label><select key={selectedBookId} id="student-lesson" name="lesson" className="native-select" defaultValue={String(bookLessons[0]?.order ?? 1)}>{bookLessons.map((lesson) => <option value={lesson.order} key={lesson.id}>Lesson {lesson.order}</option>)}</select></div>
            </div>
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

function getAudioTargets(lesson: LessonSummary) {
  const contentTargets = (lesson.content ?? []).flatMap((section) =>
    section.items.map((item) => ({
      id: buildAudioTargetId(lesson.id, section.id, item.english),
      label: `${section.title} · ${item.english}`,
    })),
  );
  if (contentTargets.length > 0) return contentTargets;

  return lesson.sections.map((section) => ({
    id: buildAudioTargetId(lesson.id, section, "section-audio"),
    label: section,
  }));
}
