import { Link } from 'react-router'
import './landing.css'

export function LandingPage() {
  return (
    <main className="landing-page">
      <div className="landing-content">
        <h1>CogniDeal</h1>
        <p className="landing-subtitle">Turn every deal signal into a clear next step.</p>
        <Link className="landing-cta" to="/dashboard">
          Go to app
        </Link>
      </div>
    </main>
  )
}
