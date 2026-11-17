import type { Resume } from "@resume-pilot/validators/resume";
import type { ReactNode } from "react";
import { resumeToDoc, type DocItem, type DocSection, type ResumeDoc } from "./doc";
import type { TemplateKey } from "./templates";

/**
 * One renderer for preview and PDF. Each template is a React component
 * over the same page model; differences are in markup order and the
 * `.rp-t-<key>` styles in css.ts. Everything is real, selectable text.
 */

const Header = ({ doc, contactFirst = false }: { doc: ResumeDoc; contactFirst?: boolean }) => {
  const contact = doc.contact.length ? (
    <ul className="rp-contact">
      {doc.contact.map((c) => (
        <li key={c}>{c}</li>
      ))}
    </ul>
  ) : null;
  return (
    <header className="rp-head">
      <h1 className="rp-name">{doc.name}</h1>
      {contactFirst ? contact : null}
      {doc.headline ? <p className="rp-headline">{doc.headline}</p> : null}
      {contactFirst ? null : contact}
    </header>
  );
};

const Item = ({ it }: { it: DocItem }) => (
  <div className="rp-item" data-item-id={it.id}>
    {it.title || it.date ? (
      <div className="rp-row">
        <span className="rp-title">{it.title}</span>
        {it.date ? <span className="rp-date">{it.date}</span> : null}
      </div>
    ) : null}
    {it.subtitle ? <div className="rp-sub">{it.subtitle}</div> : null}
    {it.tags ? (
      <p className="rp-tags">
        {it.tagLabel ? <span className="rp-tag-label">{it.tagLabel}:</span> : null}
        {it.tags.map((t, i) => (
          <span key={`${t}-${i}`} className="rp-tag">
            {t}
          </span>
        ))}
      </p>
    ) : null}
    {it.lines.length ? (
      <ul className="rp-lines">
        {it.lines.map((l, i) => (
          <li key={l.id ?? i} data-item-id={l.id} className={l.bullet ? "rp-bullet" : undefined}>
            {l.text}
          </li>
        ))}
      </ul>
    ) : null}
  </div>
);

const Section = ({ s }: { s: DocSection }) => (
  <section className="rp-section" data-section={s.key}>
    <h2 className="rp-h">{s.heading}</h2>
    {s.items.map((it, i) => (
      <Item key={it.id ?? i} it={it} />
    ))}
  </section>
);

const Page = ({ k, children }: { k: TemplateKey; children: ReactNode }) => <article className={`rp-resume rp-t-${k}`}>{children}</article>;

/** Body shared by all templates. Templates differ in header order and styling. */
const Body = ({ doc }: { doc: ResumeDoc }) => (
  <>
    {doc.sections.map((s) => (
      <Section key={s.key} s={s} />
    ))}
  </>
);

export function ClassicTemplate({ doc }: { doc: ResumeDoc }) {
  return (
    <Page k="classic">
      <Header doc={doc} />
      <Body doc={doc} />
    </Page>
  );
}
export function ModernTemplate({ doc }: { doc: ResumeDoc }) {
  return (
    <Page k="modern">
      <Header doc={doc} />
      <Body doc={doc} />
    </Page>
  );
}
export function MinimalTemplate({ doc }: { doc: ResumeDoc }) {
  return (
    <Page k="minimal">
      <Header doc={doc} contactFirst />
      <Body doc={doc} />
    </Page>
  );
}
export function ProfessionalTemplate({ doc }: { doc: ResumeDoc }) {
  return (
    <Page k="professional">
      <Header doc={doc} />
      <Body doc={doc} />
    </Page>
  );
}
export function TechnicalTemplate({ doc }: { doc: ResumeDoc }) {
  // Section order is always the user's (layout.sectionOrder); only styling differs.
  return (
    <Page k="technical">
      <Header doc={doc} />
      <Body doc={doc} />
    </Page>
  );
}

export const TEMPLATE_COMPONENTS: Record<TemplateKey, (p: { doc: ResumeDoc }) => ReactNode> = {
  classic: ClassicTemplate,
  modern: ModernTemplate,
  minimal: MinimalTemplate,
  professional: ProfessionalTemplate,
  technical: TechnicalTemplate,
};

/** Resume JSON → page for the given template. */
export function ResumeTemplate({ resume, template }: { resume: Resume; template: TemplateKey }) {
  const T = TEMPLATE_COMPONENTS[template];
  return <T doc={resumeToDoc(resume)} />;
}
