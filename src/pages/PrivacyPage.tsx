import { Link } from 'react-router-dom'
import { BrandLink } from '../components/AuthShell'
import { FEEDBACK_EMAIL } from '../shared/feedbackMail'

const UPDATED = '17 November 2026'

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
        <p>This policy explains what personal data SHEAR collects, why, and what you can do about it.</p>

        <h2>Who we are</h2>
        <p>SHEAR is run by Patryk Dudek, who is the controller of your personal data. Contact: {mail}.</p>

        <h2>What we collect</h2>
        <ul>
          <li>Account: your email address and password. We never see your password.</li>
          <li>Profile: your name, training goal, weekly workout target and units.</li>
          <li>Training: your plans, workouts, sets with weight, reps and the time you logged them, your own exercises and your records.</li>
          <li>Daily check-in, optional: sleep, mood and soreness. This may count as health data, so we only keep it when you fill it in.</li>
          <li>Coach usage: how many Coach messages you send each day, to apply the daily limit.</li>
          <li>Technical data: your IP address and basic request details when you use the app.</li>
        </ul>
        <p>We don't show ads or use analytics trackers.</p>

        <h2>Why we use it</h2>
        <ul>
          <li>To provide the app: keep your history, suggest your next weights and fit a workout to the time you have. Legal basis: our contract with you (Art. 6(1)(b) GDPR).</li>
          <li>To improve the app by looking at how features are used across accounts. Legal basis: our legitimate interest (Art. 6(1)(f) GDPR). You can object at any time by email.</li>
          <li>To keep the service secure and prevent abuse. Legal basis: our legitimate interest (Art. 6(1)(f) GDPR).</li>
        </ul>

        <h2>Who we share it with</h2>
        <p>We use these service providers, who process data on our behalf:</p>
        <ul>
          <li>Google (Firebase and Google Fonts): sign-in, database, test app distribution and web fonts.</li>
          <li>Vercel: hosting.</li>
          <li>Expo: updates for the Android app. When the app checks for an update, Expo sees your IP address and a random installation ID.</li>
          <li>Proton: email.</li>
          <li>OpenRouter and the company that runs the AI model (OpenAI, Microsoft Azure or Amazon Web Services), only when you use Coach. Coach sends them your question, profile, recent check-ins, workouts and records so it can answer. We don't store the conversations. If you use your own OpenRouter key, it passes through our server and is not stored there.</li>
        </ul>
        <p>Some of these providers process data outside the European Economic Area, mainly in the United States. These transfers rely on the EU-US Data Privacy Framework or the European Commission's standard contractual clauses.</p>

        <h2>How long we keep it</h2>
        <p>Until you delete your account. Backups and logs held by our providers are removed later, on their own schedules. Request counters used to prevent abuse hold only request times under a one-way code, so they can't be linked back to you, and they are not removed with the account.</p>

        <h2>Your rights</h2>
        <p>You can access, correct, delete, restrict or move your data, and object to how we use it. On the web, Profile → Export history downloads your workouts as a CSV file; for a full copy, email us. You can also complain to the Polish data protection authority (Prezes Urzędu Ochrony Danych Osobowych).</p>

        <h2>Age</h2>
        <p>SHEAR is for people aged 16 and over.</p>

        <h2 id="delete-your-account">Delete your account</h2>
        <ol>
          <li>Sign in to SHEAR on the web or in the Android app.</li>
          <li>Open Profile and choose Delete account.</li>
          <li>Enter your password to confirm. Your account and all its data are deleted immediately and can't be restored.</li>
        </ol>
        <p>If you can't sign in, email {mail} from your account's address and we'll delete it for you.</p>

        <h2>Changes</h2>
        <p>If we change this policy, we'll update the date at the top of this page.</p>

        <p className="privacy-back"><Link to="/">Back to SHEAR</Link></p>
      </main>
    </div>
  )
}
