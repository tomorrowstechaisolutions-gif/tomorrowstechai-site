/**
 * The shape of everything in Tomorrow's Tech AI Academy.
 *
 * The Academy is content, not a database: every course, module and lesson is
 * a plain object in src/lib/academy/courses/*. Adding a module means adding an
 * object to a course's `modules` array; adding a course means adding a file and
 * listing it in src/lib/academy/catalog.ts. The pages read from here and need
 * no changes.
 */

export type LevelId = 1 | 2 | 3 | 4;

/**
 * A lesson body is a list of blocks rather than markdown, so there is no
 * parser to maintain and every block renders the same way everywhere.
 */
export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "list"; items: string[]; ordered?: boolean }
  | { kind: "quote"; text: string; by?: string }
  /** A prompt the student can copy with one click. */
  | { kind: "prompt"; label?: string; text: string }
  /** A weak request next to a strong one. */
  | { kind: "compare"; weak: string; strong: string; note?: string }
  | { kind: "callout"; title: string; text: string };

export type Lesson = {
  /** URL segment: /academy/<course>/<slug>. Never change it once published. */
  slug: string;
  title: string;
  minutes: number;
  /** One or two sentences. Always public, even when the lesson is locked. */
  summary: string;
  /**
   * Readable by anyone, even in a paid course. Use it for the first lesson or
   * two so people can see how you teach before they pay.
   */
  preview?: boolean;
  /** A YouTube video id or a full video URL (mp4 or embeddable). Shown above the body. */
  video?: string;
  body?: Block[];
  /** "Build this": what the student makes before moving on. */
  build?: string;
};

export type Module = {
  title: string;
  summary?: string;
  lessons: Lesson[];
};

/**
 * open     — people can take it now.
 * waitlist — the page is up and lessons are being recorded; people join the
 *            founding-student list.
 * planned  — on the roadmap; shown with its outline only.
 */
export type CourseStatus = "open" | "waitlist" | "planned";

export type Price = { kind: "free" } | { kind: "paid"; amount: number; note?: string } | { kind: "tbd" };

export type QuizQuestion = {
  q: string;
  options: string[];
  /** Index into options. Never sent to the browser. */
  answer: number;
  /** Shown after grading, so a wrong answer still teaches something. */
  why: string;
};

/** The final knowledge check. Passing it issues a certificate. */
export type Quiz = {
  /** Percent needed to pass, e.g. 80. */
  pass: number;
  questions: QuizQuestion[];
};

export type Course = {
  slug: string;
  title: string;
  /** Short line under the title. */
  tagline: string;
  level: LevelId;
  price: Price;
  status: CourseStatus;
  /** Who it is for. */
  audience: string;
  /** "Never let a student finish a course with just knowledge." What they leave with. */
  build: string;
  outcomes: string[];
  /** The method this course is built on, if any. */
  framework?: "speak" | "human";
  /** The free Business AI Series volume that pairs with it. */
  volume?: string;
  /** Shown as the course's highlight on the Academy page. */
  flagship?: boolean;
  /** What is in the box: lesson count, workbook, certificate, and so on. */
  includes?: string[];
  /** Full curriculum. Courses still being designed can use `outline` instead. */
  modules?: Module[];
  /** Plain list of topics for a planned course with no lessons yet. */
  outline?: string[];
  /** Final knowledge check; passing it issues a certificate of completion. */
  quiz?: Quiz;
};

export type Level = {
  id: LevelId;
  name: string;
  priceRange: string;
  summary: string;
};
