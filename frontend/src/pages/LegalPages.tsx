import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from '@/components/ui/icons'

const UPDATED = '19 October 2026'
const CONTACT = 'aanimesh_be23@thapar.edu'

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  React.useEffect(() => {
    document.title = `${title} | TalentRank`
  }, [title])

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="text-base font-extrabold tracking-tight">
            TalentRank
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}</p>
        <p className="mt-4 border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          This is a plain-language policy written by the developer. It is not legal advice, and it has not been
          reviewed by a lawyer.
        </p>
        <div className="mt-8 space-y-8 text-sm leading-relaxed [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:tracking-tight [&_li]:mt-1.5 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <footer className="border-t border-border py-6">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-4 text-xs text-muted-foreground sm:px-6">
          <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <a href={`mailto:${CONTACT}`} className="hover:text-foreground">{CONTACT}</a>
        </div>
      </footer>
    </div>
  )
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <section>
        <h2>1. Who runs TalentRank</h2>
        <p>
          TalentRank is operated by Animesh, an individual developer (the operator). It is an open source
          resume screening project. Contact: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </section>
      <section>
        <h2>2. Using the service</h2>
        <ul>
          <li>You need an account. You must give accurate information and keep your sign-in details to yourself.</li>
          <li>Only upload resumes you are allowed to upload. If you upload someone else&apos;s resume as a recruiter, you are responsible for having a lawful reason to do so.</li>
          <li>Do not upload malicious files, try to access another team&apos;s data, or interfere with the service.</li>
        </ul>
      </section>
      <section>
        <h2>3. Scores are an aid, not a decision</h2>
        <p>
          TalentRank ranks resumes using rules and text similarity. Scores can be wrong, and resume parsing is
          imperfect. They are meant to help a person review applicants, not to replace that person. You are
          responsible for every hiring decision you make, and for following the employment and anti-discrimination
          laws that apply to you. Blind review hides names, contact details, universities, precise locations and
          resume files from reviewers, but it does not remove every signal that could identify or bias a review
          (for example, details written inside a free-text resume summary).
        </p>
      </section>
      <section>
        <h2>4. Availability and data loss</h2>
        <p>
          The hosted demo runs on free infrastructure. It may be slow, may be offline, and may lose data when the
          server restarts or is redeployed. Do not treat it as a system of record. The service is provided as is,
          without warranties of any kind.
        </p>
      </section>
      <section>
        <h2>5. Liability</h2>
        <p>
          To the extent the law allows, the operator is not liable for indirect or consequential loss, lost data,
          or hiring outcomes arising from use of the service. Nothing here limits liability that cannot be
          limited by law.
        </p>
      </section>
      <section>
        <h2>6. Ending your account</h2>
        <p>
          You can stop using the service at any time. The operator may suspend accounts that break these terms.
          To ask for your data to be deleted, see the Privacy Policy.
        </p>
      </section>
      <section>
        <h2>7. Open source</h2>
        <p>
          The source code is published under the MIT licence on GitHub. These terms cover the hosted service, not
          your right to run your own copy of the code.
        </p>
      </section>
      <section>
        <h2>8. Changes and governing law</h2>
        <p>
          These terms may change. The date above shows the latest version, and continued use means you accept it.
          These terms are governed by the laws of India. Disputes are subject to the courts of India.
        </p>
      </section>
    </LegalLayout>
  )
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <section>
        <h2>1. Who is responsible</h2>
        <p>
          Animesh, an individual developer, operates TalentRank and decides how the data below is handled.
          Contact: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </section>
      <section>
        <h2>2. What TalentRank stores</h2>
        <ul>
          <li>
            <strong>Account identity.</strong> Your email, name and role (recruiter or candidate), plus the sign-in
            record kept by Firebase Authentication. Passwords are handled by Firebase and never stored by TalentRank.
          </li>
          <li>
            <strong>Resumes and extracted candidate data.</strong> The uploaded file, its full text, and the fields
            parsed from it: name, email, phone, location, education, work history, projects, certifications and
            skills.
          </li>
          <li>
            <strong>Scores.</strong> The match score for each resume against each role, with the per-dimension
            breakdown and the resume-health score.
          </li>
          <li>
            <strong>Recruiter content.</strong> Roles, pipeline stages and the notes recruiters write about candidates.
          </li>
          <li>
            <strong>Audit log.</strong> Who changed what and when (role, candidate and stage changes), with the
            actor&apos;s name.
          </li>
          <li>
            <strong>Organizations.</strong> Each recruiter team has a name and an invite code. Roles, uploads and
            candidates are scoped to that team.
          </li>
        </ul>
        <p>
          A resume is personal data. Anyone in the uploading recruiter&apos;s organization can see the candidate
          profile and file, unless blind review is turned on for the role.
        </p>
      </section>
      <section>
        <h2>3. Why it is used</h2>
        <p>
          To parse and score resumes, show recruiters a ranked list with the reasons, let candidates see how their
          resume was read, and keep a record of changes. TalentRank does not sell data and does not show
          advertising.
        </p>
      </section>
      <section>
        <h2>4. Who else handles the data</h2>
        <ul>
          <li><strong>Google Firebase Authentication:</strong> sign-in and identity tokens.</li>
          <li><strong>Render:</strong> hosts the backend API, the database and uploaded files.</li>
          <li><strong>Vercel:</strong> hosts the website you are reading.</li>
          <li>
            <strong>Hugging Face Inference API (optional):</strong> when the operator has enabled it, short excerpts of
            resume and job text (up to about 1,500 characters each) are sent to compute embeddings for semantic
            matching. When it is not enabled, matching runs on the server only.
          </li>
        </ul>
      </section>
      <section>
        <h2>5. Blind review limits</h2>
        <p>
          With blind review on, the server withholds names, contact details, universities, precise locations and
          resume files from reviewers in that role and shows a stable alias instead. Skills, experience and
          evidence text stay visible. Free text from a resume can still contain identifying details.
        </p>
      </section>
      <section>
        <h2>6. Retention and deletion</h2>
        <ul>
          <li>Recruiters in the owning organization can delete a candidate record, a role, or a note from the app. Deleting a candidate removes the profile, extracted data and scores from the database.</li>
          <li>The stored resume file is not removed by that action today. On the hosted demo, files live on temporary disk and disappear when the server restarts or redeploys.</li>
          <li>Audit log entries stay after deletion and keep only a short summary (for example, a candidate number), not the resume.</li>
          <li>There is no self-service delete button for candidates yet. To have your account or your resume removed, email {CONTACT} and it will be done by hand.</li>
          <li>Data is otherwise kept until it is deleted or the demo server resets.</li>
        </ul>
      </section>
      <section>
        <h2>7. Your rights</h2>
        <p>
          You can ask to see, correct or delete your data by emailing {CONTACT}. Candidates can also correct their
          own parsed details in the app. Requests are answered by the operator personally and may take some days.
        </p>
      </section>
      <section>
        <h2>8. Cookies and storage</h2>
        <p>
          The site uses browser storage for your sign-in session (Firebase) and for your light or dark theme. There
          are no advertising or analytics trackers.
        </p>
      </section>
      <section>
        <h2>9. Governing law and changes</h2>
        <p>
          This policy is governed by the laws of India. It may change; the date above shows the latest version.
        </p>
      </section>
    </LegalLayout>
  )
}
