import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
  type WriteBatch,
} from "firebase/firestore";

import {
  type BookSummary,
  type HomeworkQuestion,
  type LearningSection,
  type LessonSummary,
  type Student,
} from "@/app/demo-data";

import {
  firebaseAuth,
  firebaseDb,
  waitForAuthPersistence,
} from "./firebase-client";

export type UserRole = "teacher" | "student";

export type UserProfile = {
  uid: string;
  name: string;
  role: UserRole;
  active: boolean;
};

export type FirebaseSession = {
  user: User;
  profile: UserProfile;
};

export type WorkspaceData = {
  books: BookSummary[];
  lessons: LessonSummary[];
  students: Student[];
  attempts: Record<string, StudentAttempt>;
};

export type StudentAttempt = {
  studentId: string;
  bookId: string;
  lessonId: string;
  questionId: string;
  answer: string;
  revealed: boolean;
};

export async function signIn(email: string, password: string) {
  await waitForAuthPersistence();
  return signInWithEmailAndPassword(firebaseAuth(), email, password);
}

export async function signOutCurrentUser() {
  await signOut(firebaseAuth());
}

export async function requestPasswordReset(email: string) {
  await sendPasswordResetEmail(firebaseAuth(), email);
}

export function observeAuth(
  callback: (session: FirebaseSession | null, error?: Error) => void,
): Unsubscribe {
  return onAuthStateChanged(
    firebaseAuth(),
    async (user) => {
      if (!user) {
        callback(null);
        return;
      }
      try {
        const profile = await getUserProfile(user.uid);
        if (!profile || !profile.active) {
          callback(null, new Error("Esta conta não está liberada."));
          return;
        }
        callback({ user, profile });
      } catch (error) {
        callback(null, asError(error));
      }
    },
    (error) => callback(null, error),
  );
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(firebaseDb(), "users", uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (data.role !== "teacher" && data.role !== "student") return null;
  return {
    uid,
    name: String(data.name ?? ""),
    role: data.role,
    active: data.active === true,
  };
}

export async function loadTeacherWorkspace(): Promise<WorkspaceData> {
  const books = await loadBooksForTeacher();
  const [lessons, students] = await Promise.all([
    loadLessonsForTeacher(books),
    loadStudentsForTeacher(),
  ]);
  return { books, lessons, students, attempts: {} };
}

export async function loadStudentWorkspace(uid: string): Promise<WorkspaceData> {
  const db = firebaseDb();
  const studentSnapshot = await getDoc(doc(db, "students", uid));
  if (!studentSnapshot.exists()) {
    throw new Error("O cadastro deste aluno ainda não foi concluído.");
  }
  const student = studentFromSnapshot(studentSnapshot.id, studentSnapshot.data());
  if (!student.active) {
    throw new Error("Este acesso está desativado.");
  }

  const booksSnapshot = await getDocs(
    query(
      collection(db, "books"),
      where("published", "==", true),
      where("order", "<=", student.currentBook),
    ),
  );
  const books = booksSnapshot.docs
    .map(bookFromSnapshot)
    .filter((book) => book.published !== false)
    .sort(byOrder);
  const lessonGroups = await Promise.all(
    books.map(async (book) => {
      const maximumLesson = book.order < student.currentBook
        ? Number.MAX_SAFE_INTEGER
        : student.currentLesson;
      const snapshot = await getDocs(
        query(
          collection(db, "books", book.id, "lessons"),
          where("published", "==", true),
          where("order", "<=", maximumLesson),
        ),
      );
      return snapshot.docs.map((item) => ({
        ...lessonFromSnapshot(book.id, item),
        status: "published" as const,
      }));
    }),
  );
  const attempts = await loadStudentAttempts(uid);
  await updateLastAccess(uid);
  return {
    books,
    lessons: lessonGroups.flat().sort(byBookAndOrder),
    students: [student],
    attempts,
  };
}

async function loadBooksForTeacher() {
  const snapshot = await getDocs(collection(firebaseDb(), "books"));
  return snapshot.docs.map(bookFromSnapshot).sort(byOrder);
}

async function loadLessonsForTeacher(books: BookSummary[]) {
  const groups = await Promise.all(
    books.map(async (book) => {
      const [snapshot, teacherSnapshot] = await Promise.all([
        getDocs(collection(firebaseDb(), "books", book.id, "lessons")),
        getDocs(collection(firebaseDb(), "books", book.id, "teacherLessons")),
      ]);
      const teacherContent = new Map(
        teacherSnapshot.docs.map((item) => [
          item.id,
          teacherSectionsFromSnapshot(item.data()),
        ]),
      );
      return snapshot.docs.map((item) => {
        const lesson = lessonFromSnapshot(book.id, item);
        return {
          ...lesson,
          content: mergeTeacherSections(
            lesson.content ?? [],
            teacherContent.get(item.id) ?? [],
          ),
        };
      });
    }),
  );
  return groups.flat().sort(byBookAndOrder);
}

async function loadStudentsForTeacher() {
  const snapshot = await getDocs(collection(firebaseDb(), "students"));
  return Promise.all(
    snapshot.docs.map(async (item) => {
      const count = await getCountFromServer(
        collection(firebaseDb(), "students", item.id, "attempts"),
      );
      return {
        ...studentFromSnapshot(item.id, item.data()),
        answered: count.data().count,
      };
    }),
  ).then((students) =>
    students
      .filter((student) => student.active)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  );
}

export async function saveBook(book: BookSummary) {
  await setDoc(
    doc(firebaseDb(), "books", book.id),
    {
      ...clean(book),
      lessonCount: book.lessonCount ?? 0,
      published: book.published !== false,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveLesson(lesson: LessonSummary) {
  const db = firebaseDb();
  const batch = writeBatch(db);
  const { lessonData, teacherContent } = lessonWriteData(lesson);
  batch.set(
    doc(db, "books", lesson.bookId, "lessons", lesson.id),
    lessonData,
    { merge: true },
  );
  const teacherReference = doc(
    db,
    "books",
    lesson.bookId,
    "teacherLessons",
    lesson.id,
  );
  if (teacherContent.length > 0) {
    batch.set(
      teacherReference,
      { content: clean(teacherContent), updatedAt: serverTimestamp() },
      { merge: true },
    );
  } else {
    batch.delete(teacherReference);
  }
  await batch.commit();
  await syncBookLessonCount(lesson.bookId);
}

export async function moveLesson(
  previousBookId: string,
  lesson: LessonSummary,
) {
  if (previousBookId === lesson.bookId) {
    await saveLesson(lesson);
    return;
  }
  const db = firebaseDb();
  const batch = writeBatch(db);
  const { lessonData, teacherContent } = lessonWriteData(lesson);
  batch.set(
    doc(db, "books", lesson.bookId, "lessons", lesson.id),
    lessonData,
    { merge: true },
  );
  if (teacherContent.length > 0) {
    batch.set(
      doc(db, "books", lesson.bookId, "teacherLessons", lesson.id),
      { content: clean(teacherContent), updatedAt: serverTimestamp() },
      { merge: true },
    );
  } else {
    batch.delete(doc(db, "books", lesson.bookId, "teacherLessons", lesson.id));
  }
  batch.delete(doc(db, "books", previousBookId, "lessons", lesson.id));
  batch.delete(doc(db, "books", previousBookId, "teacherLessons", lesson.id));
  await batch.commit();
  await Promise.all([
    syncBookLessonCount(previousBookId),
    syncBookLessonCount(lesson.bookId),
  ]);
}

export async function createStudentProfile(input: {
  uid: string;
  name: string;
  email: string;
  bookId: string;
  currentBook: number;
  currentLesson: number;
}) {
  const uid = input.uid.trim();
  const initials = initialsFor(input.name);
  const db = firebaseDb();
  const [userSnapshot, studentSnapshot, lessonSnapshots] = await Promise.all([
    getDoc(doc(db, "users", uid)),
    getDoc(doc(db, "students", uid)),
    getDocs(collection(db, "books", input.bookId, "lessons")),
  ]);
  if (userSnapshot.exists() || studentSnapshot.exists()) {
    throw new Error("student-profile-already-exists");
  }

  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), {
    name: input.name,
    role: "student",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "students", uid), {
    name: input.name,
    email: input.email,
    initials,
    currentBook: input.currentBook,
    currentLesson: input.currentLesson,
    lastAccess: "",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  queueLessonRelease(batch, lessonSnapshots.docs, input.currentLesson);
  await batch.commit();

  return studentFromSnapshot(uid, {
    name: input.name,
    email: input.email,
    initials,
    currentBook: input.currentBook,
    currentLesson: input.currentLesson,
    lastAccess: "",
    active: true,
  });
}

export async function updateStudentProgress(input: {
  studentId: string;
  bookId: string;
  currentBook: number;
  currentLesson: number;
}) {
  const db = firebaseDb();
  const lessonSnapshots = await getDocs(
    collection(db, "books", input.bookId, "lessons"),
  );
  const batch = writeBatch(db);
  batch.update(doc(db, "students", input.studentId), {
    currentBook: input.currentBook,
    currentLesson: input.currentLesson,
    updatedAt: serverTimestamp(),
  });
  queueLessonRelease(batch, lessonSnapshots.docs, input.currentLesson);
  await batch.commit();
}

export async function saveStudentAttempt(input: {
  studentId: string;
  bookId: string;
  lessonId: string;
  questionId: string;
  answer: string;
}) {
  const attemptId = [input.bookId, input.lessonId, input.questionId]
    .map(safeIdPart)
    .join("__");
  await setDoc(
    doc(firebaseDb(), "students", input.studentId, "attempts", attemptId),
    {
      ...input,
      revealed: true,
      revealedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function loadStudentAttempts(studentId: string) {
  const snapshot = await getDocs(
    collection(firebaseDb(), "students", studentId, "attempts"),
  );
  return Object.fromEntries(
    snapshot.docs.map((item) => {
      const data = item.data();
      const attempt: StudentAttempt = {
        studentId,
        bookId: String(data.bookId ?? ""),
        lessonId: String(data.lessonId ?? ""),
        questionId: String(data.questionId ?? ""),
        answer: String(data.answer ?? ""),
        revealed: data.revealed === true || Boolean(data.revealedAt),
      };
      return [attempt.questionId, attempt];
    }),
  );
}

export async function clearStudentAttempts(studentId: string, bookId?: string) {
  const attempts = collection(firebaseDb(), "students", studentId, "attempts");
  const snapshot = await getDocs(
    bookId ? query(attempts, where("bookId", "==", bookId)) : attempts,
  );
  await deleteSnapshots(snapshot.docs);
  return snapshot.size;
}

export async function deleteStudentPermanently(studentId: string) {
  await clearStudentAttempts(studentId);
  const db = firebaseDb();
  const batch = writeBatch(db);
  batch.delete(doc(db, "students", studentId));
  batch.delete(doc(db, "users", studentId));
  await batch.commit();
}

export async function deleteLessonPermanently(
  bookId: string,
  lessonId: string,
) {
  await deleteMatchingAttempts(
    (data) => data.bookId === bookId && data.lessonId === lessonId,
  );
  const db = firebaseDb();
  const batch = writeBatch(db);
  batch.delete(doc(db, "books", bookId, "lessons", lessonId));
  batch.delete(doc(db, "books", bookId, "teacherLessons", lessonId));
  await batch.commit();
  await syncBookLessonCount(bookId);
}

export async function deleteHomeworkQuestionPermanently(
  lesson: LessonSummary,
  questionId: string,
) {
  const homework = (lesson.homework ?? []).filter(
    (question) => question.id !== questionId,
  );
  await deleteMatchingAttempts(
    (data) =>
      data.bookId === lesson.bookId
      && data.lessonId === lesson.id
      && data.questionId === questionId,
  );
  await saveLesson({
    ...lesson,
    homework,
    homeworkCount: homework.length,
  });
}

export async function deleteBookPermanently(bookId: string) {
  const db = firebaseDb();
  const [lessons, teacherLessons] = await Promise.all([
    getDocs(collection(db, "books", bookId, "lessons")),
    getDocs(collection(db, "books", bookId, "teacherLessons")),
  ]);
  await deleteMatchingAttempts((data) => data.bookId === bookId);
  await deleteSnapshots(lessons.docs);
  await deleteSnapshots(teacherLessons.docs);
  const batch = writeBatch(db);
  batch.delete(doc(db, "books", bookId));
  await batch.commit();
}

async function deleteMatchingAttempts(
  matches: (data: DocumentData) => boolean,
) {
  const db = firebaseDb();
  const students = await getDocs(collection(db, "students"));
  const groups = await Promise.all(
    students.docs.map((student) =>
      getDocs(collection(db, "students", student.id, "attempts")),
    ),
  );
  await deleteSnapshots(
    groups.flatMap((group) =>
      group.docs.filter((attempt) => matches(attempt.data())),
    ),
  );
}

async function updateLastAccess(studentId: string) {
  await updateDoc(doc(firebaseDb(), "students", studentId), {
    lastAccess: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
}

async function deleteSnapshots(
  snapshots: QueryDocumentSnapshot<DocumentData, DocumentData>[],
) {
  const db = firebaseDb();
  for (let index = 0; index < snapshots.length; index += 400) {
    const batch = writeBatch(db);
    snapshots.slice(index, index + 400).forEach((snapshot) => {
      batch.delete(snapshot.ref);
    });
    await batch.commit();
  }
}

function bookFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData, DocumentData>,
): BookSummary {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    order: Number(data.order ?? 1),
    title: String(data.title ?? "Livro"),
    lessonCount: Math.max(0, Number(data.lessonCount ?? 0)),
    published: data.published !== false,
    practiceUrl: String(data.practiceUrl ?? ""),
    practiceLabel: String(data.practiceLabel ?? ""),
  };
}

async function syncBookLessonCount(bookId: string) {
  const db = firebaseDb();
  const lessons = await getDocs(collection(db, "books", bookId, "lessons"));
  await setDoc(
    doc(db, "books", bookId),
    {
      lessonCount: lessons.size,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function queueLessonRelease(
  batch: WriteBatch,
  snapshots: QueryDocumentSnapshot<DocumentData, DocumentData>[],
  maximumLesson: number,
) {
  snapshots.forEach((snapshot) => {
    if (Number(snapshot.data().order ?? 1) > maximumLesson) return;
    batch.set(
      snapshot.ref,
      {
        published: true,
        status: "published",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

function lessonWriteData(lesson: LessonSummary) {
  const content = (lesson.content ?? []).map((section, index) => ({
    ...section,
    audience: section.audience === "teacher" ? "teacher" as const : "student" as const,
    order: Number.isFinite(section.order) ? section.order : index,
  }));
  const studentContent = content
    .filter((section) => section.audience !== "teacher")
    .map((section) => ({
      id: section.id,
      title: section.title,
      items: section.items,
      order: section.order,
    }));
  const teacherContent = content.filter(
    (section) => section.audience === "teacher",
  );
  const lessonFields = {
    id: lesson.id,
    bookId: lesson.bookId,
    order: lesson.order,
    title: lesson.title,
    subtitle: lesson.subtitle,
    status: lesson.status,
    homeworkCount: lesson.homeworkCount,
    audioCount: lesson.audioCount,
  };
  const sections = content.length > 0
    ? studentContent.map((section) => section.title)
    : lesson.sections;
  return {
    lessonData: {
      ...clean(lessonFields),
      sections: clean(sections),
      published: lesson.status === "published",
      content: clean(studentContent),
      homework: clean(lesson.homework ?? []),
      homeworkCount: lesson.homework?.length ?? lesson.homeworkCount,
      updatedAt: serverTimestamp(),
    },
    teacherContent,
  };
}

function teacherSectionsFromSnapshot(data: DocumentData): LearningSection[] {
  if (!Array.isArray(data.content)) return [];
  return (data.content as LearningSection[]).map((section, index) => ({
    ...section,
    audience: "teacher",
    order: Number.isFinite(section.order) ? section.order : index,
  }));
}

function mergeTeacherSections(
  studentContent: LearningSection[],
  teacherContent: LearningSection[],
) {
  return [
    ...studentContent.map((section, index) => ({
      ...section,
      audience: "student" as const,
      order: Number.isFinite(section.order) ? section.order : index,
    })),
    ...teacherContent,
  ].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function lessonFromSnapshot(
  bookId: string,
  snapshot: QueryDocumentSnapshot<DocumentData, DocumentData>,
): LessonSummary {
  const data = snapshot.data();
  const homework = Array.isArray(data.homework)
    ? (data.homework as HomeworkQuestion[])
    : [];
  return {
    id: snapshot.id,
    bookId,
    order: Number(data.order ?? 1),
    title: String(data.title ?? "Lesson"),
    subtitle: String(data.subtitle ?? ""),
    status: data.published === true || data.status === "published"
      ? "published"
      : "draft",
    sections: Array.isArray(data.sections)
      ? data.sections.map(String)
      : [],
    homeworkCount: homework.length || Number(data.homeworkCount ?? 0),
    audioCount: Number(data.audioCount ?? 0),
    content: Array.isArray(data.content)
      ? (data.content as LearningSection[]).map((section, index) => ({
          ...section,
          audience: "student",
          order: Number.isFinite(section.order) ? section.order : index,
        }))
      : [],
    homework,
  };
}

function studentFromSnapshot(id: string, data: DocumentData): Student {
  return {
    id,
    name: String(data.name ?? "Aluno"),
    email: String(data.email ?? ""),
    initials: String(data.initials ?? initialsFor(String(data.name ?? "Aluno"))),
    currentBook: Number(data.currentBook ?? 1),
    currentLesson: Number(data.currentLesson ?? 1),
    answered: Number(data.answered ?? 0),
    lastAccess: formatLastAccess(data.lastAccess),
    active: data.active !== false,
  };
}

function formatLastAccess(value: unknown) {
  if (!value) return "Ainda não acessou";
  const date = typeof value === "string"
    ? new Date(value)
    : value instanceof Date
      ? value
      : typeof value === "object"
          && value !== null
          && "toDate" in value
          && typeof value.toDate === "function"
        ? value.toDate()
      : null;
  if (!date || Number.isNaN(date.getTime())) return "Ainda não acessou";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function safeIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
}

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function byOrder(a: BookSummary, b: BookSummary) {
  return a.order - b.order;
}

function byBookAndOrder(a: LessonSummary, b: LessonSummary) {
  return a.bookId.localeCompare(b.bookId) || a.order - b.order;
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error("Erro inesperado no Firebase.");
}
