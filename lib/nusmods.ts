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

const ACADEMIC_YEAR = "2025-2026";
const SEMESTER = 2;

export async function fetchNUSModsModule(moduleCode: string): Promise<NUSModsData | null> {
  try {
    const response = await fetch(
      `https://api.nusmods.com/v2/${ACADEMIC_YEAR}/modules/${moduleCode}.json`
    );
    if (!response.ok) return null;

    const data = await response.json();
    const semData = data.semesterData?.find((s: any) => s.semester === SEMESTER);

    if (!semData) return null;

    const lessons: NUSModsLesson[] = (semData.timetable || []).map((l: any) => ({
      type: l.lessonType,
      day: l.day,
      time: `${l.startTime.slice(0, 2)}:${l.startTime.slice(2)}–${l.endTime.slice(0, 2)}:${l.endTime.slice(2)}`,
      venue: l.venue,
    }));

    // Deduplicate lessons (NUSMods returns one entry per week or per slot, we just want unique types/times/days)
    const uniqueLessons = lessons.filter(
      (v, i, a) =>
        a.findIndex(
          (t) => t.type === v.type && t.day === v.day && t.time === v.time
        ) === i
    );

    const exam: NUSModsExam = {
      date: semData.examDate
        ? new Date(semData.examDate).toLocaleDateString("en-SG", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "No Exam",
      time: semData.examDate
        ? new Date(semData.examDate).toLocaleTimeString("en-SG", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "—",
      venue: semData.examVenue || (semData.examDate ? "Refer to NUSMods" : "—"),
      duration: semData.examDuration
        ? `${Math.floor(semData.examDuration / 60)} hrs`
        : "—",
    };

    return {
      mc: Number(data.moduleCredit),
      faculty: data.faculty,
      lessons: uniqueLessons,
      exam,
    };
  } catch (error) {
    console.error(`Error fetching NUSMods data for ${moduleCode}:`, error);
    return null;
  }
}
