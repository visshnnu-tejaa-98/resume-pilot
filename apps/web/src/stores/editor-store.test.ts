import { RESUMES } from "@resume-pilot/ai/fixtures";
import { resumeToDoc } from "@resume-pilot/resume-templates";
import { resumeSchema } from "@resume-pilot/validators/resume";
import { beforeEach, describe, expect, it } from "vitest";
import type { VersionView } from "@/features/versions/types";
import { nextId, useEditorStore } from "./editor-store";

const base = RESUMES.frontend!;
const version = { id: "v1", kind: "generated", content: base, template: "Classic", savedAt: new Date(), score: { value: 70, outdated: false } } as unknown as VersionView;
const s = () => useEditorStore.getState();
const valid = () => resumeSchema.safeParse(s().content).success;

beforeEach(() => s().load(version));

describe("editor store", () => {
  it("every edit bumps the revision and marks the score outdated; content stays schema-valid", () => {
    s().editSummary("New summary");
    expect(s().revision).toBe(1);
    expect(s().scoreOutdated).toBe(true);
    expect(valid()).toBe(true);
    s().markSaved(1);
    expect(s().savedRevision).toBe(1);
  });

  it("DONE WHEN: reordering sections persists to layout.sectionOrder and the preview follows it", () => {
    const before = [...s().content!.layout.sectionOrder];
    s().moveSection(0, 2);
    const after = s().content!.layout.sectionOrder;
    expect(after[2]).toBe(before[0]);
    expect(resumeToDoc(s().content!).sections.map((x) => x.key)).toEqual(after.filter((k) => resumeToDoc(s().content!).sections.some((x) => x.key === k)));
    expect(valid()).toBe(true);
  });

  it("DONE WHEN: reordering items and bullets persists their order", () => {
    const ids = s().content!.workExperience.map((w) => w.id);
    s().moveItem("workExperience", 0, 1);
    expect(s().content!.workExperience.map((w) => w.id)).toEqual([ids[1], ids[0]]);
    const w = s().content!.workExperience[0]!;
    s().addBullet("workExperience", w.id);
    const bs = s().content!.workExperience[0]!.bullets.map((b) => b.id);
    s().moveBullet("workExperience", w.id, bs.length - 1, 0);
    expect(s().content!.workExperience[0]!.bullets[0]!.id).toBe(bs.at(-1));
  });

  it("add/delete items get unique ids and deleting cleans the layout", () => {
    const id = s().addItem("workExperience");
    expect(s().content!.workExperience.some((w) => w.id === id)).toBe(true);
    s().toggleItemHidden(id);
    expect(s().content!.layout.hiddenItems).toContain(id);
    s().removeItem("workExperience", id);
    expect(s().content!.layout.hiddenItems).not.toContain(id);
    expect(valid()).toBe(true);
  });

  it("custom sections: add, edit, hide, remove", () => {
    const id = s().addCustomSection();
    expect(s().content!.layout.sectionOrder).toContain(`custom:${id}`);
    const item = s().addItem("customSections", id);
    s().editItem("customSections", item, { heading: "Volunteering" }, id);
    s().toggleSection(`custom:${id}`);
    expect(valid()).toBe(true);
    s().removeCustomSection(id);
    expect(s().content!.layout.sectionOrder).not.toContain(`custom:${id}`);
    expect(s().content!.layout.hiddenSections).not.toContain(`custom:${id}`);
    expect(valid()).toBe(true);
  });

  it("dates, skills and links parse into schema-valid content", () => {
    const w = s().content!.workExperience[0]!;
    s().setDates("workExperience", w.id, "Mar 2020 – Present");
    expect(s().content!.workExperience[0]).toMatchObject({ isCurrent: true, startDate: { value: "2020-03" } });
    const g = s().content!.skills[0]!;
    s().setSkillNames(g.id, ["React", "Vue", ""]);
    expect(s().content!.skills[0]!.items.map((i) => i.name)).toEqual(["React", "Vue"]);
    s().setLinks(["https://github.com/asha", "https://linkedin.com/in/asha"]);
    expect(s().content!.personalInfo.links.map((l) => l.type)).toEqual(["github", "linkedin"]);
    expect(valid()).toBe(true);
  });

  it("nextId never reuses an id", () => {
    const id = nextId(base, "b");
    expect(JSON.stringify(base)).not.toContain(`"${id}"`);
  });
});
