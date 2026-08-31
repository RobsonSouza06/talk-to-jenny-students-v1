export type StudentProgressUpdate = {
  studentId: string;
  currentBook: number;
  currentLesson: number;
};

export type StudentAttemptInput = {
  studentId: string;
  bookId: string;
  lessonId: string;
  questionId: string;
  answer: string;
};

export interface LearningRepository {
  listTeacherBooks(): Promise<unknown[]>;
  listTeacherStudents(): Promise<unknown[]>;
  listStudentLessons(studentId: string): Promise<unknown[]>;
  saveStudentAttempt(input: StudentAttemptInput): Promise<void>;
  updateStudentProgress(input: StudentProgressUpdate): Promise<void>;
  deleteStudentBookAttempts(studentId: string, bookId: string): Promise<number>;
  deleteStudentPermanently(studentId: string): Promise<void>;
}

// Firebase will be the first implementation. A future database only needs a
// new repository and audio-storage adapter; the screens keep the same contract.
