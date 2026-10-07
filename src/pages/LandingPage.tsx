import { Link } from 'react-router'
import './landing.css'

export function LandingPage() {
  return (
    <main className="landing-page">
      <div className="landing-orbit" aria-hidden="true">
        <span className="landing-orbit__ring" />
        <span className="landing-orbit__ring landing-orbit__ring--outer" />
      </div>

      <div className="landing-content">
        <img className="landing-logo" src="/logo.svg" alt="" width={88} height={88} />
        <h1>CogniDeal</h1>
        <p className="landing-subtitle">Turn every deal signal into a clear next step.</p>
        <Link className="landing-cta" to="/dashboard">
          Go to app
          <span className="landing-cta__arrow" aria-hidden="true">
            &rarr;
          </span>
        </Link>
      </div>
    </main>
  )
}
