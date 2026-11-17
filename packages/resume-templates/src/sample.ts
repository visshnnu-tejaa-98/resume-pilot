import { resumeSchema, type Resume } from "@resume-pilot/validators/resume";

/** Fictional sample used for template thumbnails and the gallery. Not a real person. */
export const SAMPLE_RESUME: Resume = resumeSchema.parse({
  schemaVersion: "2.0",
  personalInfo: { firstName: "Asha", lastName: "Rao", headline: "Frontend Engineer", email: "asha@example.com", phone: "+91 98000 00021", location: "Bengaluru", links: [] },
  summary: { text: "Frontend engineer with 5 years of experience building React and TypeScript products, design systems and accessible UI." },
  workExperience: [
    {
      id: "we_1",
      company: "Northwind",
      designation: "Senior Frontend Engineer",
      location: "Bengaluru",
      startDate: { value: "2023-07", raw: "Jul 2023" },
      endDate: { value: null, raw: "Present" },
      isCurrent: true,
      bullets: [
        { id: "b_1", text: "Lead the React and TypeScript design system used across all customer-facing web apps." },
        { id: "b_2", text: "Cut page load time by 38% by splitting bundles and caching API responses." },
      ],
    },
    {
      id: "we_2",
      company: "Globex",
      designation: "Frontend Engineer",
      location: "Pune",
      startDate: { value: "2021-01", raw: "Jan 2021" },
      endDate: { value: "2023-06", raw: "Jun 2023" },
      bullets: [{ id: "b_3", text: "Built the self-serve billing dashboard used by 4,000 business customers." }],
    },
  ],
  skills: [
    { id: "sg_1", category: "Languages", items: [{ id: "s_1", name: "TypeScript" }, { id: "s_2", name: "JavaScript" }] },
    { id: "sg_2", category: "Frameworks", items: [{ id: "s_3", name: "React" }, { id: "s_4", name: "Next.js" }] },
  ],
  education: [
    { id: "ed_1", institution: "VIT Vellore", degree: "B.Tech", fieldOfStudy: "Computer Science", startDate: { value: "2016", raw: "2016" }, endDate: { value: "2020", raw: "2020" } },
  ],
});
