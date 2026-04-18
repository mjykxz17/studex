export type NUSModsLesson = {
  type: string;
  day: string;
  time: string;
  venue: string;
};

export type NUSModsExam = {
  date: string;
  time: string;
  venue: string;
  duration: string;
};

export type NUSModsData = {
  mc: number;
  faculty: string;
  lessons: NUSModsLesson[];
  exam: NUSModsExam;
};

type NUSModsSemesterLesson = {
  lessonType: string;
  day: string;
  startTime: string;
  endTime: string;
  venue: string;
};

type NUSModsSemesterData = {
  semester: number;
  timetable?: NUSModsSemesterLesson[];
  examDate?: string | null;
  examVenue?: string | null;
  examDuration?: number | null;
};

type NUSModsModuleResponse = {
  moduleCredit?: string | number;
  faculty?: string;
  semesterData?: NUSModsSemesterData[];
};

const ACADEMIC_YEAR = "2025-2026";
const SEMESTER = 2;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const cache = new Map<string, { data: NUSModsData | null; expiresAt: number }>();

export async function fetchNUSModsModule(moduleCode: string): Promise<NUSModsData | null> {
  if (!moduleCode) {
    return null;
  }

  const cached = cache.get(moduleCode);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  try {
    const response = await fetch(`https://api.nusmods.com/v2/${ACADEMIC_YEAR}/modules/${moduleCode}.json`);

    if (!response.ok) {
      cache.set(moduleCode, { data: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    const payload = (await response.json()) as NUSModsModuleResponse;
    const semesterData = payload.semesterData?.find((entry) => entry.semester === SEMESTER);

    if (!semesterData) {
      cache.set(moduleCode, { data: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    const lessons = (semesterData.timetable ?? []).map((lesson) => ({
      type: lesson.lessonType,
      day: lesson.day,
      time: `${lesson.startTime.slice(0, 2)}:${lesson.startTime.slice(2)}–${lesson.endTime.slice(0, 2)}:${lesson.endTime.slice(2)}`,
      venue: lesson.venue,
    }));

    const uniqueLessons = lessons.filter(
      (lesson, index, allLessons) =>
        allLessons.findIndex(
          (candidate) =>
            candidate.type === lesson.type && candidate.day === lesson.day && candidate.time === lesson.time && candidate.venue === lesson.venue,
        ) === index,
    );

    const exam: NUSModsExam = {
      date: semesterData.examDate
        ? new Date(semesterData.examDate).toLocaleDateString("en-SG", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "No exam",
      time: semesterData.examDate
        ? new Date(semesterData.examDate).toLocaleTimeString("en-SG", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "—",
      venue: semesterData.examVenue || (semesterData.examDate ? "Refer to NUSMods" : "—"),
      duration: semesterData.examDuration ? `${Math.round(semesterData.examDuration / 60)} hrs` : "—",
    };

    const result: NUSModsData = {
      mc: Number(payload.moduleCredit ?? 0),
      faculty: payload.faculty ?? "Unknown faculty",
      lessons: uniqueLessons,
      exam,
    };

    cache.set(moduleCode, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (error) {
    console.error(`Error fetching NUSMods data for ${moduleCode}:`, error);
    cache.set(moduleCode, { data: null, expiresAt: Date.now() + 5 * 60 * 1000 });
    return null;
  }
}
