import { describe, expect, it } from "vitest";
import {
  collectIds,
  editorIssues,
  fromStructuredOutput,
  IdAllocator,
  migrate_1_0_to_2_0,
  parseDateRange,
  parseResumeDate,
  readResume,
  resumeJsonSchema,
  resumeMetaSchema,
  resumeModelShape,
  resumeResponseFormat,
  ResumeOutputError,
  resumeSchema,
  unreviewedLowConfidence,
  UnsupportedSchemaVersionError,
} from "./index";

/** prd.md §6.1, with the placeholder strings filled in with real values. */
const prdExample = {
  schemaVersion: "2.0",
  personalInfo: {
    firstName: "Priya",
    lastName: "Raman",
    headline: "Senior Software Engineer",
    email: "priya@example.com",
    phone: "+91 98450 12345",
    location: "Bengaluru",
    links: [
      { id: "ln_1", type: "linkedin", label: "LinkedIn", url: "https://linkedin.com/in/priya" },
    ],
  },
  summary: { text: "Backend engineer focused on payments." },
  workExperience: [
    {
      id: "we_1",
      company: "Flipkart",
      designation: "Senior Software Engineer",
      employmentType: "full-time",
      location: "Bengaluru",
      startDate: { value: "2021-01", raw: "Jan 2021" },
      endDate: { value: null, raw: "Present" },
      isCurrent: true,
      bullets: [
        { id: "b_1", text: "Cut checkout p95 latency by 38%", kind: "achievement" },
        { id: "b_2", text: "Ran the payments on-call rotation", kind: "responsibility" },
      ],
      skillsUsed: ["Kubernetes", "Go"],
    },
    {
      id: "we_2",
      company: "Zoho",
      designation: "Software Engineer",
      employmentType: null,
      location: "Chennai",
      startDate: { value: "2017-07", raw: "Jul 2017" },
      endDate: { value: "2020-12", raw: "Dec 2020" },
      isCurrent: false,
      bullets: [{ id: "b_3", text: "Built invoicing APIs", kind: "responsibility" }],
      skillsUsed: [],
    },
  ],
  education: [
    {
      id: "ed_1",
      institution: "NIT Trichy",
      degree: "B.Tech",
      fieldOfStudy: "Computer Science",
      location: "Tiruchirappalli",
      startDate: { value: "2013", raw: "2013" },
      endDate: { value: "2017", raw: "2017" },
      grade: { value: "8.4", scale: "CGPA/10" },
      bullets: [{ id: "b_4", text: "Dean's list" }],
    },
  ],
  skills: [
    {
      id: "sk_1",
      category: "Languages",
      items: [
        { id: "s_1", name: "Java" },
        { id: "s_2", name: "Go" },
      ],
    },
  ],
  projects: [
    {
      id: "pr_1",
      name: "Ledger",
      role: "Author",
      url: "https://github.com/priya/ledger",
      startDate: { value: "2022", raw: "2022" },
      endDate: { value: null, raw: "" },
      bullets: [{ id: "b_5", text: "Double-entry ledger in Go" }],
      technologies: ["Go", "PostgreSQL"],
    },
  ],
  certifications: [
    {
      id: "ce_1",
      name: "CKA",
      issuer: "CNCF",
      issueDate: { value: "2023-03", raw: "March 2023" },
      expiryDate: { value: "2026-03", raw: "March 2026" },
      credentialId: "LF-123",
      credentialUrl: "https://cncf.io/verify/LF-123",
    },
  ],
  customSections: [
    {
      id: "cs_1",
      title: "Talks",
      items: [
        {
          id: "ci_1",
          heading: "Scaling checkout",
          subheading: "RootConf",
          date: { value: "2023-05", raw: "May 2023" },
          bullets: [{ id: "b_6", text: "30-minute talk" }],
        },
      ],
    },
  ],
  layout: {
    sectionOrder: [
      "summary",
      "workExperience",
      "projects",
      "skills",
      "education",
      "certifications",
      "custom:cs_1",
    ],
    hiddenSections: [] as string[],
    hiddenItems: [] as string[],
  },
};

const clone = <T>(v: T): T => structuredClone(v);
const issuesOf = (v: unknown) =>
  resumeSchema.safeParse(v).error?.issues.map((i) => i.message) ?? [];

describe("resumeSchema: §6.1 / §6.2 examples", () => {
  it("accepts the full §6.1 example", () => {
    expect(resumeSchema.safeParse(prdExample).success).toBe(true);
  });

  it("accepts the §6.2 metadata example", () => {
    const meta = resumeMetaSchema.parse({
      extractionMeta: {
        "workExperience[id=we_1].startDate": {
          confidence: "low",
          reason: "Only year found",
          reviewed: false,
        },
      },
      provenance: { "we_1.bullets[b_3]": { sourceBulletIds: ["b_3"], changeType: "rewritten" } },
    });
    expect(unreviewedLowConfidence(meta.extractionMeta)).toEqual([
      "workExperience[id=we_1].startDate",
    ]);
  });

  it("fills defaults so a near-empty (partly extracted) resume is still valid", () => {
    const r = resumeSchema.parse({ schemaVersion: "2.0" });
    expect(r.personalInfo.firstName).toBe("");
    expect(r.workExperience).toEqual([]);
    expect(r.layout.sectionOrder).toEqual([
      "summary",
      "workExperience",
      "projects",
      "skills",
      "education",
      "certifications",
    ]);
  });

  it("rejects a different schemaVersion", () => {
    expect(resumeSchema.safeParse({ ...prdExample, schemaVersion: "1.0" }).success).toBe(false);
  });
});

describe("resumeSchema: rules", () => {
  it("ids must be app-shaped and unique", () => {
    const freeText = clone(prdExample);
    freeText.workExperience[0]!.id = "Flipkart job";
    expect(resumeSchema.safeParse(freeText).success).toBe(false);

    const dup = clone(prdExample);
    dup.workExperience[1]!.bullets[0]!.id = "b_1";
    expect(issuesOf(dup)).toContain('Duplicate id "b_1"');
  });

  it("dates are YYYY-MM or YYYY; free text belongs in raw", () => {
    for (const bad of ["June 2021", "2021-13", "21-06", "2021-6", "1850"]) {
      const r = clone(prdExample);
      r.workExperience[1]!.startDate.value = bad;
      expect(resumeSchema.safeParse(r).success, bad).toBe(false);
    }
  });

  it("an end date before the start is rejected, comparing at shared precision", () => {
    const r = clone(prdExample);
    r.workExperience[1]!.endDate.value = "2016-12";
    expect(issuesOf(r)).toContain("End date is before start date");

    const sameYear = clone(prdExample);
    sameYear.education[0]!.startDate.value = "2017-08";
    sameYear.education[0]!.endDate.value = "2017"; // year-only end, same year: fine
    expect(resumeSchema.safeParse(sameYear).success).toBe(true);
  });

  it("isCurrent means Present: no end date", () => {
    const r = clone(prdExample);
    r.workExperience[0]!.endDate.value = "2024-01";
    expect(issuesOf(r)).toContain("A current job has no end date (Present)");
  });

  it("layout may only reference sections and items that exist, once each", () => {
    const unknownCustom = clone(prdExample);
    unknownCustom.layout.sectionOrder.push("custom:cs_9");
    expect(issuesOf(unknownCustom)).toContain('Unknown section "custom:cs_9"');

    const twice = clone(prdExample);
    twice.layout.sectionOrder.push("summary");
    expect(issuesOf(twice)).toContain("A section appears twice in sectionOrder");

    const hiddenItem = clone(prdExample);
    hiddenItem.layout.hiddenItems = ["b_99"];
    expect(issuesOf(hiddenItem)).toContain('Unknown item "b_99"');

    const ok = clone(prdExample);
    ok.layout.hiddenSections = ["custom:cs_1"];
    ok.layout.hiddenItems = ["b_2", "we_2"];
    expect(resumeSchema.safeParse(ok).success).toBe(true);
  });

  it("enums are closed sets", () => {
    const r = clone(prdExample) as { workExperience: { employmentType: string }[] };
    r.workExperience[0]!.employmentType = "gig";
    expect(resumeSchema.safeParse(r).success).toBe(false);
  });

  it("collectIds walks every item in document order", () => {
    const ids = collectIds(resumeSchema.parse(prdExample));
    expect(ids).toEqual([
      "ln_1",
      "we_1",
      "b_1",
      "b_2",
      "we_2",
      "b_3",
      "ed_1",
      "b_4",
      "sk_1",
      "s_1",
      "s_2",
      "pr_1",
      "b_5",
      "ce_1",
      "cs_1",
      "ci_1",
      "b_6",
    ]);
  });

  it("metadata paths address items by id, provenance needs a source", () => {
    expect(
      resumeMetaSchema.safeParse({
        extractionMeta: { "workExperience[0].startDate": { confidence: "low", reason: "" } },
      }).success,
    ).toBe(false);
    expect(
      resumeMetaSchema.safeParse({
        provenance: { "we_1.bullets[b_3]": { sourceBulletIds: [], changeType: "merged" } },
      }).success,
    ).toBe(false);
    expect(
      resumeMetaSchema.safeParse({
        extractionMeta: { "personalInfo.email": { confidence: "high", reason: "" } },
      }).success,
    ).toBe(false);
  });
});

describe("editorIssues (§6.3 required fields)", () => {
  it("passes a complete resume", () => {
    expect(editorIssues(resumeSchema.parse(prdExample))).toEqual([]);
  });

  it("flags a missing name, contact, company and title", () => {
    const r = resumeSchema.parse({
      schemaVersion: "2.0",
      workExperience: [{ id: "we_1", company: " ", designation: "" }],
    });
    expect(editorIssues(r).map((i) => i.path)).toEqual([
      "personalInfo.firstName",
      "personalInfo.email",
      "workExperience[id=we_1].company",
      "workExperience[id=we_1].designation",
    ]);
  });

  it("any one contact method is enough", () => {
    const r = resumeSchema.parse({
      schemaVersion: "2.0",
      personalInfo: { firstName: "A", phone: "123" },
    });
    expect(editorIssues(r)).toEqual([]);
  });
});

describe("parseResumeDate", () => {
  it.each([
    ["Jan 2021", "2021-01", false],
    ["January 2021", "2021-01", false],
    ["Sept. 2019", "2019-09", false],
    ["2021-06", "2021-06", false],
    ["2021/6", "2021-06", false],
    ["06/2021", "2021-06", false],
    ["2021", "2021", false],
    ["Summer 2021", "2021", false],
    ["Class of 2017", "2017", false],
    ["Present", null, true],
    ["current", null, true],
    ["Till date", null, true],
    ["", null, false],
    ["someday", null, false],
    ["13/2021", "2021", false],
  ])("%s → %s", (input, value, present) => {
    const { date, isPresent } = parseResumeDate(input);
    expect(date).toEqual({ value, raw: input });
    expect(isPresent).toBe(present);
  });

  it("splits ranges", () => {
    const r = parseDateRange("Jan 2021 – Present");
    expect(r.start.date.value).toBe("2021-01");
    expect(r.end.isPresent).toBe(true);
    expect(parseDateRange("2017 to 2020").end.date.value).toBe("2020");
    expect(parseDateRange("2021-06").start.date.value).toBe("2021-06");
  });
});

describe("IdAllocator", () => {
  it("never reuses an id that already exists", () => {
    const alloc = new IdAllocator(["we_1", "we_7", "b_3"]);
    expect(alloc.take("work")).toBe("we_8");
    expect(alloc.take("bullet")).toBe("b_4");
    expect(alloc.take("project")).toBe("pr_1");
  });
});

// --- Structured Outputs -------------------------------------------------

type Node = Record<string, unknown>;
function walk(node: unknown, visit: (n: Node, path: string) => void, path = "$") {
  if (!node || typeof node !== "object") return;
  const n = node as Node;
  visit(n, path);
  for (const [k, v] of Object.entries(n.properties ?? {})) walk(v, visit, `${path}.${k}`);
  if (n.items) walk(n.items, visit, `${path}[]`);
  for (const [i, v] of ((n.anyOf as unknown[]) ?? []).entries()) walk(v, visit, `${path}|${i}`);
}

describe("Structured Outputs schema (derived, not hand-written)", () => {
  const schema = resumeJsonSchema();

  it("meets OpenAI strict mode: every object closed, every property required, no defaults or lengths", () => {
    walk(schema, (n, path) => {
      if (n.properties) {
        expect(n.additionalProperties, path).toBe(false);
        expect(new Set(n.required as string[]), path).toEqual(
          new Set(Object.keys(n.properties as object)),
        );
      }
      for (const banned of ["default", "maxLength", "minLength", "$schema"]) {
        expect(n[banned], `${path} has ${banned}`).toBeUndefined();
      }
    });
  });

  it("never asks the model for ids, schemaVersion or layout", () => {
    walk(schema, (n, path) => {
      const props = Object.keys((n.properties as object) ?? {});
      expect(props, path).not.toContain("id");
    });
    expect(Object.keys(schema.properties!)).not.toContain("schemaVersion");
    expect(Object.keys(schema.properties!)).not.toContain("layout");
  });

  it("is generated from the canonical Zod object: same sections and fields", () => {
    expect(Object.keys(schema.properties!).sort()).toEqual(
      Object.keys(resumeModelShape.shape).sort(),
    );
    // Sections with a default are nullable (the model may return null for
    // a section the resume doesn't have), so unwrap the anyOf first.
    const section = schema.properties!.workExperience as Node;
    expect(section.anyOf as Node[]).toContainEqual({ type: "null" });
    const array = (section.anyOf as Node[]).find((s) => s.type === "array")!;
    const work = array.items as Node;
    expect(Object.keys(work.properties as object).sort()).toEqual(
      [
        "company",
        "designation",
        "employmentType",
        "location",
        "startDate",
        "endDate",
        "isCurrent",
        "bullets",
        "skillsUsed",
      ].sort(),
    );
  });

  it("keeps the date pattern and the enums", () => {
    const json = JSON.stringify(schema);
    expect(json).toContain("(19|20)\\\\d{2}");
    expect(json).toContain('"achievement"');
    expect(json).toContain('"CGPA/10"');
  });

  it("stays inside OpenAI's size limits", () => {
    let properties = 0;
    let depth = 0;
    walk(schema, (n, path) => {
      properties += Object.keys((n.properties as object) ?? {}).length;
      depth = Math.max(depth, (path.match(/\./g) ?? []).length);
    });
    expect(properties).toBeLessThan(5000);
    expect(depth).toBeLessThanOrEqual(10);
  });

  it("wraps it as a Responses API text.format", () => {
    expect(resumeResponseFormat()).toMatchObject({
      type: "json_schema",
      name: "resume",
      strict: true,
    });
  });
});

describe("fromStructuredOutput", () => {
  /** What a strict-mode response looks like: every key present, nulls for absent. */
  const modelOutput = {
    personalInfo: {
      firstName: "Priya",
      lastName: "Raman",
      headline: null,
      email: "priya@example.com",
      phone: null,
      location: "Bengaluru",
      links: [{ type: "github", label: null, url: "https://github.com/priya" }],
    },
    summary: { text: null },
    workExperience: [
      {
        company: "Flipkart",
        designation: "Senior Software Engineer",
        employmentType: null,
        location: null,
        startDate: { value: "June 2021", raw: "June 2021" }, // malformed value
        endDate: { value: "2024-01", raw: "Present" }, // contradicts isCurrent
        isCurrent: true,
        bullets: [
          { text: "Cut latency by 38%", kind: "achievement" },
          { text: "On-call", kind: null },
        ],
        skillsUsed: null,
      },
    ],
    education: null,
    skills: [{ category: "Languages", items: [{ name: "Go" }] }],
    projects: [],
    certifications: [],
    customSections: [],
  };

  it("produces a valid canonical resume with app ids", () => {
    const r = fromStructuredOutput(modelOutput);
    expect(r.schemaVersion).toBe("2.0");
    expect(r.workExperience[0]!.id).toBe("we_1");
    expect(r.workExperience[0]!.bullets.map((b) => b.id)).toEqual(["b_1", "b_2"]);
    expect(r.personalInfo.links[0]).toMatchObject({ id: "ln_1", type: "github", label: "" });
    expect(r.skills[0]!.items[0]!.id).toBe("s_1");
    expect(r.education).toEqual([]);
    expect(r.workExperience[0]!.bullets[1]!.kind).toBe("responsibility");
  });

  it("re-derives a malformed date value from raw, and drops a current job's end date", () => {
    const job = fromStructuredOutput(modelOutput).workExperience[0]!;
    expect(job.startDate).toEqual({ value: "2021-06", raw: "June 2021" });
    expect(job.endDate).toEqual({ value: null, raw: "Present" });
  });

  it("keeps new ids clear of the source version's ids", () => {
    const r = fromStructuredOutput(modelOutput, { existingIds: ["we_3", "b_9"] });
    expect(r.workExperience[0]!.id).toBe("we_4");
    expect(r.workExperience[0]!.bullets[0]!.id).toBe("b_10");
  });

  it("ignores any id the model tries to supply", () => {
    const sneaky = structuredClone(modelOutput) as Record<string, unknown> & {
      workExperience: Record<string, unknown>[];
    };
    sneaky.workExperience[0]!.id = "Fake Company Inc";
    expect(fromStructuredOutput(sneaky).workExperience[0]!.id).toBe("we_1");
  });

  it("throws ResumeOutputError for output that can't be a resume", () => {
    expect(() => fromStructuredOutput("not json")).toThrow(ResumeOutputError);
    const bad = structuredClone(modelOutput) as { workExperience: { employmentType: unknown }[] };
    bad.workExperience[0]!.employmentType = "gig";
    expect(() => fromStructuredOutput(bad)).toThrow(ResumeOutputError);
  });
});

describe("migrate_1_0_to_2_0 / readResume", () => {
  const v1 = {
    schemaVersion: "1.0",
    personalInfo: {
      name: "Priya Raman",
      email: "priya@example.com",
      links: ["https://linkedin.com/in/priya"],
    },
    summary: "Backend engineer.",
    experience: [
      {
        company: "Flipkart",
        title: "Senior Software Engineer",
        duration: "Jan 2021 - Present",
        responsibilities: ["Cut latency by 38%"],
      },
      {
        company: "Zoho",
        title: "Software Engineer",
        startDate: "Jul 2017",
        endDate: "Dec 2020",
        bullets: ["Built invoicing APIs"],
      },
    ],
    education: [{ school: "NIT Trichy", degree: "B.Tech", year: "2017", gpa: "8.4" }],
    skills: "Java, Go, PostgreSQL",
    certifications: ["CKA"],
  };

  it("converts v1 into a valid 2.0 resume with ids, parsed dates and grouped skills", () => {
    const r = migrate_1_0_to_2_0(v1);
    expect(r.personalInfo).toMatchObject({ firstName: "Priya", lastName: "Raman" });
    expect(r.personalInfo.links[0]).toMatchObject({ id: "ln_1", type: "linkedin" });
    expect(r.summary.text).toBe("Backend engineer.");
    expect(r.workExperience[0]).toMatchObject({
      id: "we_1",
      designation: "Senior Software Engineer",
      isCurrent: true,
      startDate: { value: "2021-01", raw: "Jan 2021" },
      endDate: { value: null, raw: "Present" },
    });
    expect(r.workExperience[0]!.bullets[0]).toMatchObject({
      id: "b_1",
      text: "Cut latency by 38%",
    });
    expect(r.workExperience[1]!.endDate.value).toBe("2020-12");
    expect(r.education[0]).toMatchObject({
      institution: "NIT Trichy",
      endDate: { value: "2017" },
      grade: { value: "8.4" },
    });
    expect(r.skills).toEqual([
      {
        id: "sk_1",
        category: "Skills",
        items: [
          { id: "s_1", name: "Java" },
          { id: "s_2", name: "Go" },
          { id: "s_3", name: "PostgreSQL" },
        ],
      },
    ]);
    expect(r.certifications[0]!.name).toBe("CKA");
  });

  it("readResume: 2.0 passes through, v1 (or no version) migrates and asks to be saved back", () => {
    expect(readResume(prdExample)).toMatchObject({ migrated: false });
    const migrated = readResume(v1);
    expect(migrated.migrated).toBe(true);
    // Saving it back and reading again is a no-op.
    expect(readResume(migrated.resume)).toEqual({ resume: migrated.resume, migrated: false });
    const { schemaVersion: _, ...unversioned } = v1;
    expect(readResume(unversioned).migrated).toBe(true);
  });

  it("refuses a version newer than this code knows", () => {
    expect(() => readResume({ schemaVersion: "3.0" })).toThrow(UnsupportedSchemaVersionError);
  });

  it("is pure: the input isn't modified", () => {
    const input = structuredClone(v1);
    migrate_1_0_to_2_0(input);
    expect(input).toEqual(v1);
  });
});
