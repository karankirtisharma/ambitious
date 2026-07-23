import { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { AsciiGlitchRipple } from '../fx/AsciiGlitchRipple';

const LINKS = ['HOME', 'MANIFESTO', 'SERVICES', 'CONTACT'] as const;

/** Split around the centred mark, as the notch layout expects. */
const LEFT_LINKS = LINKS.slice(0, 2);
const RIGHT_LINKS = LINKS.slice(2);

/**
 * Notch navbar — a 64px centre tab dropping below 40px side rails, joined by
 * two 50px corner curves. Twin hairlines trace the whole silhouette so it
 * reads as one continuous cut edge.
 *
 * Ported to this project's stack: no Tailwind, no icon set, no second
 * animation runtime. The corner fills are clip-path so the panel's blur is
 * clipped with them — the notch is genuinely glass, not a painted shape.
 */
export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const burger = useRef<HTMLButtonElement>(null);

  // Escape closes the menu and hands focus back to the burger.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        burger.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <>
      <header className="cy-nav">
        {/* left rail — carries the wordmark */}
        <div className="cy-nav__rail cy-nav__rail--l">
          <RailLines />
          <span className="cy-nav__wordmark">CYPHERNAUT</span>
        </div>

        <div className="cy-nav__notch">
          {/* corner: rail height curving down into the tab */}
          <div className="cy-nav__corner cy-nav__corner--l">
            <span className="cy-nav__corner-fill" aria-hidden="true" />
            <svg className="cy-nav__corner-line" viewBox="0 0 50 64" aria-hidden="true">
              <path d="M0 39.5 C25 39.5 25 63.5 50 63.5" fill="none" stroke="currentColor" strokeWidth="0.5" />
              <path d="M0 36.5 C25 36.5 25 60.5 50 60.5" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </svg>
          </div>

          <div className="cy-nav__tab">
            <span className="cy-nav__tab-fill" aria-hidden="true" />
            <svg className="cy-nav__tab-line" preserveAspectRatio="none" aria-hidden="true">
              <line x1="0" y1="63.5" x2="100%" y2="63.5" stroke="currentColor" strokeWidth="0.5" />
              <line x1="0" y1="60.5" x2="100%" y2="60.5" stroke="currentColor" strokeWidth="0.5" />
            </svg>

            <div className="cy-nav__content">
              <nav className="cy-nav__links cy-nav__links--l" aria-label="Primary">
                {LEFT_LINKS.map((link) => (
                  <NavLink key={link} label={link} />
                ))}
              </nav>

              <button
                ref={burger}
                className="cy-nav__burger ia"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span />
                <span />
                <span />
              </button>

              <a
                className="cy-nav__mark ia"
                href="#"
                aria-label="CYPHERNAUT home"
                onClick={(e) => e.preventDefault()}
              >
                <Logo size={26} />
              </a>

              <nav className="cy-nav__links cy-nav__links--r" aria-label="Secondary">
                {RIGHT_LINKS.map((link) => (
                  <NavLink key={link} label={link} />
                ))}
                <span
                  className="cy-nav__secure"
                  aria-label="Secure channel, end-to-end encrypted"
                >
                  SECURE
                  <span className="cy-dot cy-dot--pulse" aria-hidden="true" />
                </span>
              </nav>

              <span className="cy-nav__secure cy-nav__secure--sm" aria-hidden="true">
                <span className="cy-dot cy-dot--pulse" />
              </span>
            </div>
          </div>

          {/* corner: tab height curving back up to the rail */}
          <div className="cy-nav__corner cy-nav__corner--r">
            <span className="cy-nav__corner-fill" aria-hidden="true" />
            <svg className="cy-nav__corner-line" viewBox="0 0 50 64" aria-hidden="true">
              <path d="M0 63.5 C25 63.5 25 39.5 50 39.5" fill="none" stroke="currentColor" strokeWidth="0.5" />
              <path d="M0 60.5 C25 60.5 25 36.5 50 36.5" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </svg>
          </div>
        </div>

        {/* right rail */}
        <div className="cy-nav__rail">
          <RailLines />
          <span className="cy-nav__status">CORE // v2.4</span>
        </div>
      </header>

      {menuOpen && (
        <div className="cy-menu ia" aria-label="Menu" onClick={() => setMenuOpen(false)}>
          <ul className="cy-menu__list">
            {LINKS.map((link) => (
              <li key={link}>
                <a
                  className="cy-menu__link"
                  href="#"
                  aria-current={link === 'MANIFESTO' ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    setMenuOpen(false);
                  }}
                >
                  {link}
                  {link !== 'MANIFESTO' && (
                    <span className="cy-menu__soon" style={{ color: 'var(--grey-3)' }}>
                      TRANSMISSION PENDING
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function NavLink({ label }: { label: string }) {
  return (
    // Scramble ripples out from wherever the cursor crosses the word — the
    // effect's native home is exactly this kind of short monospace link.
    // `aria-label` inside the component keeps the real word announced.
    <AsciiGlitchRipple
      as="a"
      className="cy-nav__link"
      href="#"
      dur={720}
      spread={1.15}
      aria-current={label === 'MANIFESTO' ? 'page' : undefined}
      onClick={(e) => e.preventDefault()}
    >
      {label}
    </AsciiGlitchRipple>
  );
}

/** The twin hairlines that run the length of each rail. */
function RailLines() {
  return (
    <svg className="cy-nav__rail-line" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="39.5" x2="100%" y2="39.5" stroke="currentColor" strokeWidth="0.5" />
      <line x1="0" y1="36.5" x2="100%" y2="36.5" stroke="currentColor" strokeWidth="0.5" />
    </svg>
  );
}
