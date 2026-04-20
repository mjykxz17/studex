import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hasSupabaseConfigMock = vi.fn(() => true);
const fetchNUSModsModuleMock = vi.fn(async () => null);

vi.mock("@/lib/config", () => ({
  hasSupabaseConfig: () => hasSupabaseConfigMock(),
}));

vi.mock("@/lib/nusmods", () => ({
  fetchNUSModsModule: (...args: unknown[]) => fetchNUSModsModuleMock(...(args as [])),
}));

type QueryResult = { data: unknown; error: null | { message: string } };

const queryResponses = new Map<string, QueryResult>();

function setQueryResponse(key: string, response: QueryResult) {
  queryResponses.set(key, response);
}

function buildQueryBuilder(table: string) {
  const state = { table };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => queryResponses.get(`${state.table}:maybeSingle`) ?? { data: null, error: null },
    then: (onFulfilled: (value: QueryResult) => unknown) =>
      Promise.resolve(queryResponses.get(state.table) ?? { data: [], error: null }).then(onFulfilled),
  };
  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => buildQueryBuilder(table),
  }),
}));

beforeEach(() => {
  queryResponses.clear();
  hasSupabaseConfigMock.mockReturnValue(true);
  process.env.CANVAS_BASE_URL = "https://canvas.nus.edu.sg";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "service-key";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadDashboardData — GradeSummary derivation", () => {
  it("derives canvasUrl from CANVAS_BASE_URL + canvas_course_id + source_ref_id", async () => {
    setQueryResponse("users:maybeSingle", { data: { id: "user-1", last_synced_at: null }, error: null });
    setQueryResponse("courses", { data: [], error: null });
    setQueryResponse("tasks", { data: [], error: null });
    setQueryResponse("announcements", { data: [], error: null });
    setQueryResponse("course_modules", { data: [], error: null });
    setQueryResponse("grades", {
      data: [
        {
          id: "g1",
          score: 85,
          grade_text: "85",
          points_possible: 100,
          graded_at: "2026-04-19T00:00:00Z",
          state: "graded",
          tasks: {
            id: "t1",
            title: "Homework 1",
            source_ref_id: "42",
            courses: { code: "CS3235", canvas_course_id: "9876" },
          },
        },
      ],
      error: null,
    });

    const { loadDashboardData } = await import("@/lib/dashboard");
    const data = await loadDashboardData();
    expect(data.recentGrades).toHaveLength(1);
    expect(data.recentGrades[0].canvasUrl).toBe("https://canvas.nus.edu.sg/courses/9876/assignments/42");
    expect(data.recentGrades[0].assignmentTitle).toBe("Homework 1");
    expect(data.recentGrades[0].score).toBe(85);
  });
});

describe("loadDashboardData — CourseProgressSummary heuristic", () => {
  it("picks the first non-completed module as current", async () => {
    setQueryResponse("users:maybeSingle", { data: { id: "user-1", last_synced_at: null }, error: null });
    setQueryResponse("courses", { data: [], error: null });
    setQueryResponse("tasks", { data: [], error: null });
    setQueryResponse("announcements", { data: [], error: null });
    setQueryResponse("grades", { data: [], error: null });
    setQueryResponse("course_modules", {
      data: [
        {
          id: "cm1",
          course_id: "c1",
          name: "Week 1",
          position: 1,
          state: "completed",
          items_count: 3,
          courses: { code: "CS3235", title: "Computer Security" },
          course_module_items: [{ id: "i1", title: "Intro", item_type: "File", position: 1 }],
        },
        {
          id: "cm2",
          course_id: "c1",
          name: "Week 2",
          position: 2,
          state: "unlocked",
          items_count: 2,
          courses: { code: "CS3235", title: "Computer Security" },
          course_module_items: [{ id: "i2", title: "Read Chapter 2", item_type: "Page", position: 1 }],
        },
      ],
      error: null,
    });

    const { loadDashboardData } = await import("@/lib/dashboard");
    const data = await loadDashboardData();
    expect(data.courseProgress).toHaveLength(1);
    expect(data.courseProgress[0].currentModulePosition).toBe(2);
    expect(data.courseProgress[0].currentModuleName).toBe("Week 2");
    expect(data.courseProgress[0].nextItemTitle).toBe("Read Chapter 2");
    expect(data.courseProgress[0].totalModules).toBe(2);
  });

  it("falls back to the last module when every module is completed", async () => {
    setQueryResponse("users:maybeSingle", { data: { id: "user-1", last_synced_at: null }, error: null });
    setQueryResponse("courses", { data: [], error: null });
    setQueryResponse("tasks", { data: [], error: null });
    setQueryResponse("announcements", { data: [], error: null });
    setQueryResponse("grades", { data: [], error: null });
    setQueryResponse("course_modules", {
      data: [
        {
          id: "cm1",
          course_id: "c1",
          name: "Week 1",
          position: 1,
          state: "completed",
          items_count: 1,
          courses: { code: "CS3235", title: "Computer Security" },
          course_module_items: [{ id: "i1", title: "Intro", item_type: "File", position: 1 }],
        },
        {
          id: "cm2",
          course_id: "c1",
          name: "Week 2",
          position: 2,
          state: "completed",
          items_count: 1,
          courses: { code: "CS3235", title: "Computer Security" },
          course_module_items: [{ id: "i2", title: "Quiz 2", item_type: "Quiz", position: 1 }],
        },
      ],
      error: null,
    });

    const { loadDashboardData } = await import("@/lib/dashboard");
    const data = await loadDashboardData();
    expect(data.courseProgress[0].currentModulePosition).toBe(2);
    expect(data.courseProgress[0].currentModuleName).toBe("Week 2");
  });
});
