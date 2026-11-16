import { Link } from 'react-router-dom'
import { BrandLink } from '../components/AuthShell'
import { FEEDBACK_EMAIL } from '../shared/feedbackMail'

const UPDATED = '16 November 2026'

// Public: testers read it before creating an account, and Google Play links to its deletion section.
export default function PrivacyPage() {
  const mail = <a href={`mailto:${FEEDBACK_EMAIL}`}>{FEEDBACK_EMAIL}</a>
  return (
    <div className="privacy">
      <header className="privacy-bar">
        <BrandLink />
      </header>
      <main className="privacy-body">
        <h1>Privacy policy</h1>
        <p className="privacy-updated">Last updated {UPDATED}</p>
        <p>SHEAR is a strength training log. This page explains what data it keeps, why, who else handles it and how you can see or delete it.</p>

        <h2>Who is responsible</h2>
        <p>Patryk Dudek runs SHEAR and is the controller of your data. Contact: {mail}.</p>

        <h2>What we keep</h2>
        <ul>
          <li><strong>Account:</strong> your email address and password, handled by Firebase Authentication. We never see your password.</li>
          <li><strong>Profile:</strong> your name, training goal, workouts per week and units.</li>
          <li><strong>Training:</strong> your plans, workouts, sets with their weights, reps and the time each set was logged, your own exercises, and records derived from them.</li>
          <li><strong>Daily check-in (optional):</strong> how you slept, your mood and soreness. This is close to health data, so it is only kept when you fill it in, and you can skip it every day.</li>
          <li><strong>Technical:</strong> your IP address appears in our hosting logs and, when you use Coach, in a short-lived hashed counter that limits requests.</li>
        </ul>
        <p>We do not use advertising or third-party analytics.</p>

        <h2>Why, and on what basis</h2>
        <ul>
          <li>To run the app for you: your history, the next weights, shortening a plan to the time you have. The basis is our agreement with you when you create an account.</li>
          <li>To improve the app, we look at how features are used across all accounts, for example whether shortened workouts fit the chosen time. The basis is our legitimate interest; you can object at any time by email.</li>
        </ul>

        <h2>Who else handles it</h2>
        <ul>
          <li><strong>Google Firebase</strong> stores your account and training data. Firebase App Distribution holds testers' email addresses and device details.</li>
          <li><strong>Vercel</strong> runs our server functions and keeps request logs with IP addresses.</li>
          <li><strong>Google Fonts</strong> serves the web app's fonts, so Google receives your IP address when a page loads.</li>
          <li><strong>Proton</strong> hosts {FEEDBACK_EMAIL}, so it holds the messages you send us.</li>
          <li><strong>Coach (optional):</strong> when you use it with your own OpenRouter key, your profile, the last 31 days of check-ins, your workouts and records are sent through our server to OpenRouter and the model provider you chose, to answer you. We do not store the conversation.</li>
        </ul>
        <p>Some of these providers process data outside the European Economic Area, mainly in the United States, under the European Commission's standard contractual clauses or the EU–US Data Privacy Framework.</p>

        <h2>How long</h2>
        <p>Until you delete your account. Deleting removes your data from our database at once. Copies in our providers' backups and logs expire later under their own rules.</p>

        <h2>Your rights</h2>
        <ul>
          <li>See your data and get a copy: Profile → Export history on the web gives your workouts as a CSV file; email us for a full copy.</li>
          <li>Correct, restrict, move or delete your data, and object to the use for improving the app.</li>
          <li>Complain to the Polish data protection authority, the President of the Personal Data Protection Office (UODO).</li>
        </ul>

        <h2>Age</h2>
        <p>SHEAR is for people aged 16 and over.</p>

        <h2 id="delete-your-account">Delete your account</h2>
        <ol>
          <li>Open SHEAR on the web or in the Android app and sign in.</li>
          <li>Go to Profile and choose <strong>Delete account</strong>.</li>
          <li>Enter your password to confirm. Your account and all your data are deleted at once and cannot be restored.</li>
        </ol>
        <p>If you can no longer sign in, email {mail} from the address of your account and we will delete it for you.</p>

        <p className="privacy-back"><Link to="/">Back to SHEAR</Link></p>
      </main>
    </div>
  )
}
