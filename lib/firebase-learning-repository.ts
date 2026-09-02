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
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
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
  trashItems: TrashItem[];
  auditLogs: AuditLog[];
};

export type StudentAttempt = {
  studentId: string;
  bookId: string;
  lessonId: string;
  questionId: string;
  answer: string;
  revealed: boolean;
};

export type TrashKind = "homework" | "lesson";

export type TrashItem = {
  id: string;
  kind: TrashKind;
  bookId: string;
  lessonId: string;
  questionId?: string;
  bookTitle: string;
  lessonOrder: number;
  lessonTitle: string;
  label: string;
  deletedAt: string;
  purgeAfter: string;
  position?: number;
  payload: HomeworkQuestion | LessonSummary;
};

export type AuditAction = "moved_to_trash" | "restored" | "purged";

export type AuditLog = {
  id: string;
  action: AuditAction;
  kind: TrashKind;
  bookId: string;
  lessonId: string;
  questionId?: string;
  label: string;
  occurredAt: string;
  actorUid: string;
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
  await purgeExpiredTrash();
  const books = await loadBooksForTeacher();
  const [lessons, students, trashItems, auditLogs] = await Promise.all([
    loadLessonsForTeacher(books),
    loadStudentsForTeacher(),
    loadTrashItems(),
    loadAuditLogs(),
  ]);
  return { books, lessons, students, attempts: {}, trashItems, auditLogs };
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

  const explicitBookIds = Object.keys(student.bookAccess ?? {});
  const books = explicitBookIds.length > 0
    ? (await Promise.all(
        explicitBookIds.map((bookId) => getDoc(doc(db, "books", bookId))),
      ))
        .filter((snapshot) => snapshot.exists())
        .map(bookFromSnapshot)
        .filter((book) => book.published !== false)
        .sort(byOrder)
    : (await getDocs(
        query(
          collection(db, "books"),
          where("published", "==", true),
          where("order", "<=", student.currentBook),
        ),
      )).docs
        .map(bookFromSnapshot)
        .filter((book) => book.published !== false)
        .sort(byOrder);
  const lessonGroups = await Promise.all(
    books.map(async (book) => {
      const maximumLesson = explicitBookIds.length > 0
        ? student.bookAccess?.[book.id] ?? 0
        : book.order < student.currentBook
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
    trashItems: [],
    auditLogs: [],
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
  queueLessonWrite(batch, lesson);
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
  bookAccess: Record<string, number>;
  currentBook: number;
  currentLesson: number;
}) {
  const uid = input.uid.trim();
  const initials = initialsFor(input.name);
  const db = firebaseDb();
  const [userSnapshot, studentSnapshot, lessonSnapshotGroups] = await Promise.all([
    getDoc(doc(db, "users", uid)),
    getDoc(doc(db, "students", uid)),
    Promise.all(
      Object.keys(input.bookAccess).map(async (bookId) => ({
        bookId,
        snapshots: await getDocs(collection(db, "books", bookId, "lessons")),
      })),
    ),
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
    bookAccess: input.bookAccess,
    currentBook: input.currentBook,
    currentLesson: input.currentLesson,
    lastAccess: "",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  lessonSnapshotGroups.forEach(({ bookId, snapshots }) => {
    queueLessonRelease(batch, snapshots.docs, input.bookAccess[bookId] ?? 0);
  });
  await batch.commit();

  return studentFromSnapshot(uid, {
    name: input.name,
    email: input.email,
    initials,
    bookAccess: input.bookAccess,
    currentBook: input.currentBook,
    currentLesson: input.currentLesson,
    lastAccess: "",
    active: true,
  });
}

export async function updateStudentProgress(input: {
  studentId: string;
  bookAccess: Record<string, number>;
  currentBook: number;
  currentLesson: number;
}) {
  const db = firebaseDb();
  const lessonSnapshotGroups = await Promise.all(
    Object.keys(input.bookAccess).map(async (bookId) => ({
      bookId,
      snapshots: await getDocs(collection(db, "books", bookId, "lessons")),
    })),
  );
  const batch = writeBatch(db);
  batch.update(doc(db, "students", input.studentId), {
    bookAccess: input.bookAccess,
    currentBook: input.currentBook,
    currentLesson: input.currentLesson,
    updatedAt: serverTimestamp(),
  });
  lessonSnapshotGroups.forEach(({ bookId, snapshots }) => {
    queueLessonRelease(batch, snapshots.docs, input.bookAccess[bookId] ?? 0);
  });
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

export async function moveLessonToTrash(
  lesson: LessonSummary,
  bookTitle: string,
) {
  const db = firebaseDb();
  const trashItem = createTrashItem({
    kind: "lesson",
    lesson,
    bookTitle,
    label: `Lesson ${lesson.order} · ${lesson.title}`,
    payload: lesson,
  });
  const batch = writeBatch(db);
  batch.set(doc(db, "trash", trashItem.id), clean(trashItem));
  batch.delete(doc(db, "books", lesson.bookId, "lessons", lesson.id));
  batch.delete(doc(db, "books", lesson.bookId, "teacherLessons", lesson.id));
  queueAuditLog(batch, trashItem, "moved_to_trash");
  await batch.commit();
  await syncBookLessonCount(lesson.bookId);
  return trashItem;
}

export async function moveHomeworkQuestionToTrash(
  lesson: LessonSummary,
  questionId: string,
  bookTitle: string,
) {
  const position = (lesson.homework ?? []).findIndex(
    (question) => question.id === questionId,
  );
  const question = lesson.homework?.[position];
  if (!question) throw new Error("trash-question-not-found");
  const homework = (lesson.homework ?? []).filter(
    (item) => item.id !== questionId,
  );
  const updatedLesson = {
    ...lesson,
    homework,
    homeworkCount: homework.length,
  };
  const trashItem = createTrashItem({
    kind: "homework",
    lesson,
    bookTitle,
    label: question.prompt,
    payload: question,
    questionId,
    position,
  });
  const db = firebaseDb();
  const batch = writeBatch(db);
  batch.set(doc(db, "trash", trashItem.id), clean(trashItem));
  queueLessonWrite(batch, updatedLesson);
  queueAuditLog(batch, trashItem, "moved_to_trash");
  await batch.commit();
  return trashItem;
}

export async function loadTrashItems(): Promise<TrashItem[]> {
  const snapshot = await getDocs(collection(firebaseDb(), "trash"));
  return snapshot.docs
    .map((item) => trashItemFromSnapshot(item.id, item.data()))
    .filter((item): item is TrashItem => item !== null)
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function loadAuditLogs(): Promise<AuditLog[]> {
  const snapshot = await getDocs(
    query(
      collection(firebaseDb(), "auditLogs"),
      orderBy("occurredAt", "desc"),
      limit(40),
    ),
  );
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      action: data.action as AuditAction,
      kind: data.kind as TrashKind,
      bookId: String(data.bookId ?? ""),
      lessonId: String(data.lessonId ?? ""),
      questionId: data.questionId ? String(data.questionId) : undefined,
      label: String(data.label ?? "Item"),
      occurredAt: String(data.occurredAt ?? ""),
      actorUid: String(data.actorUid ?? ""),
    };
  });
}

export async function restoreTrashItem(item: TrashItem) {
  const db = firebaseDb();
  const batch = writeBatch(db);
  if (!(await getDoc(doc(db, "books", item.bookId))).exists()) {
    throw new Error("trash-book-missing");
  }

  if (item.kind === "lesson") {
    const activeReference = doc(
      db,
      "books",
      item.bookId,
      "lessons",
      item.lessonId,
    );
    if ((await getDoc(activeReference)).exists()) {
      throw new Error("trash-lesson-conflict");
    }
    queueLessonWrite(batch, item.payload as LessonSummary);
  } else {
    const lessonReference = doc(
      db,
      "books",
      item.bookId,
      "lessons",
      item.lessonId,
    );
    const lessonSnapshot = await getDoc(lessonReference);
    if (!lessonSnapshot.exists()) throw new Error("trash-parent-missing");
    const data = lessonSnapshot.data();
    const homework = Array.isArray(data.homework)
      ? [...(data.homework as HomeworkQuestion[])]
      : [];
    const question = item.payload as HomeworkQuestion;
    if (homework.some((current) => current.id === question.id)) {
      throw new Error("trash-question-conflict");
    }
    const position = Math.min(
      Math.max(item.position ?? homework.length, 0),
      homework.length,
    );
    homework.splice(position, 0, question);
    batch.set(
      lessonReference,
      {
        homework: clean(homework),
        homeworkCount: homework.length,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  batch.delete(doc(db, "trash", item.id));
  queueAuditLog(batch, item, "restored");
  await batch.commit();
  if (item.kind === "lesson") await syncBookLessonCount(item.bookId);
}

export async function purgeTrashItem(item: TrashItem, ignoreRetention = false) {
  if (!ignoreRetention && new Date(item.purgeAfter).getTime() > Date.now()) {
    throw new Error("trash-retention-active");
  }
  await deleteMatchingAttempts((data) =>
    data.bookId === item.bookId
    && data.lessonId === item.lessonId
    && (
      item.kind === "lesson"
      || data.questionId === item.questionId
    ),
  );
  const db = firebaseDb();
  const batch = writeBatch(db);
  batch.delete(doc(db, "trash", item.id));
  queueAuditLog(batch, item, "purged");
  await batch.commit();
}

export async function purgeExpiredTrash() {
  const items = await loadTrashItems();
  const expired = items.filter(
    (item) => new Date(item.purgeAfter).getTime() <= Date.now(),
  );
  for (const item of expired) {
    await purgeTrashItem(item, true);
  }
  return expired.map((item) => item.id);
}

export async function deleteBookPermanently(bookId: string) {
  const db = firebaseDb();
  const [lessons, teacherLessons, trash] = await Promise.all([
    getDocs(collection(db, "books", bookId, "lessons")),
    getDocs(collection(db, "books", bookId, "teacherLessons")),
    getDocs(collection(db, "trash")),
  ]);
  await deleteMatchingAttempts((data) => data.bookId === bookId);
  await deleteSnapshots(lessons.docs);
  await deleteSnapshots(teacherLessons.docs);
  await deleteSnapshots(
    trash.docs.filter((item) => item.data().bookId === bookId),
  );
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
  snapshot: DocumentSnapshot<DocumentData, DocumentData>,
): BookSummary {
  const data = snapshot.data() ?? {};
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

function queueLessonWrite(batch: WriteBatch, lesson: LessonSummary) {
  const db = firebaseDb();
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
}

function createTrashItem(input: {
  kind: TrashKind;
  lesson: LessonSummary;
  bookTitle: string;
  label: string;
  payload: HomeworkQuestion | LessonSummary;
  questionId?: string;
  position?: number;
}): TrashItem {
  const deletedAt = new Date();
  const purgeAfter = new Date(deletedAt);
  purgeAfter.setDate(purgeAfter.getDate() + 10);
  const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: [
      input.kind,
      safeIdPart(input.lesson.bookId),
      safeIdPart(input.lesson.id),
      uniquePart,
    ].join("__"),
    kind: input.kind,
    bookId: input.lesson.bookId,
    lessonId: input.lesson.id,
    questionId: input.questionId,
    bookTitle: input.bookTitle,
    lessonOrder: input.lesson.order,
    lessonTitle: input.lesson.title,
    label: input.label,
    deletedAt: deletedAt.toISOString(),
    purgeAfter: purgeAfter.toISOString(),
    position: input.position,
    payload: clean(input.payload),
  };
}

function queueAuditLog(
  batch: WriteBatch,
  item: TrashItem,
  action: AuditAction,
) {
  const db = firebaseDb();
  const occurredAt = new Date().toISOString();
  const reference = doc(collection(db, "auditLogs"));
  batch.set(reference, clean({
    action,
    kind: item.kind,
    bookId: item.bookId,
    lessonId: item.lessonId,
    questionId: item.questionId,
    label: item.label,
    occurredAt,
    actorUid: firebaseAuth().currentUser?.uid ?? "",
  }));
}

function trashItemFromSnapshot(
  id: string,
  data: DocumentData,
): TrashItem | null {
  if (data.kind !== "homework" && data.kind !== "lesson") return null;
  if (!data.payload || typeof data.payload !== "object") return null;
  return {
    id,
    kind: data.kind,
    bookId: String(data.bookId ?? ""),
    lessonId: String(data.lessonId ?? ""),
    questionId: data.questionId ? String(data.questionId) : undefined,
    bookTitle: String(data.bookTitle ?? "Livro"),
    lessonOrder: Number(data.lessonOrder ?? 0),
    lessonTitle: String(data.lessonTitle ?? "Lesson"),
    label: String(data.label ?? "Item"),
    deletedAt: String(data.deletedAt ?? ""),
    purgeAfter: String(data.purgeAfter ?? ""),
    position: Number.isInteger(data.position) ? Number(data.position) : undefined,
    payload: data.payload as HomeworkQuestion | LessonSummary,
  };
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
      audioEmbedUrl: section.audioEmbedUrl,
      kind: section.kind,
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
    bookAccess: bookAccessFromData(data.bookAccess),
    currentBook: Number(data.currentBook ?? 1),
    currentLesson: Number(data.currentLesson ?? 1),
    answered: Number(data.answered ?? 0),
    lastAccess: formatLastAccess(data.lastAccess),
    active: data.active !== false,
  };
}

function bookAccessFromData(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([bookId, lesson]) => (
      Boolean(bookId)
      && Number.isInteger(Number(lesson))
      && Number(lesson) > 0
    ))
    .map(([bookId, lesson]) => [bookId, Number(lesson)] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
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
