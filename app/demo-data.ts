export type LessonStatus = "published" | "draft";

export type BookSummary = {
  id: string;
  order: number;
  title: string;
  lessonCount?: number;
  published?: boolean;
  practiceUrl?: string;
  practiceLabel?: string;
};

export type Student = {
  id: string;
  name: string;
  email: string;
  initials: string;
  bookAccess?: Record<string, number>;
  currentBook: number;
  currentLesson: number;
  answered: number;
  lastAccess: string;
  active: boolean;
};

export type LearningItem = {
  english: string;
  portuguese: string;
  example?: string;
  translation?: string;
  audioText?: string;
};

export type LearningSection = {
  id: string;
  title: string;
  items: LearningItem[];
  audioEmbedUrl?: string;
  kind?: "standard" | "story";
  audience?: "student" | "teacher";
  order?: number;
};

export type HomeworkQuestion = {
  id: string;
  category: string;
  prompt: string;
  answer: string;
};

export type LessonSummary = {
  id: string;
  bookId: string;
  order: number;
  title: string;
  subtitle: string;
  status: LessonStatus;
  sections: string[];
  homeworkCount: number;
  audioCount: number;
  content?: LearningSection[];
  homework?: HomeworkQuestion[];
};
