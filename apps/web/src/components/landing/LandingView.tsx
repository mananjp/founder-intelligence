"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import Lenis from "lenis";
import Image from "next/image";
import "./landing.css";

// Dynamic imports with SSR disabled for Three.js WebGL canvases
const Scene = dynamic(
  () => import("./Scene").then((mod) => mod.Scene),
  { ssr: false }
);

const Device = dynamic(
  () => import("./Device").then((mod) => mod.Device),
  {
    ssr: false,
    loading: () => (
      <div className="device">
        <div className="device-ui">
          <div className="ui-top">
            <span>FI / WORKSPACE</span>
            <span>LIVE</span>
          </div>
          <div className="ui-title">
            Evidence workspace<span>.</span>
          </div>
          <div className="ui-score">
            <small>EVIDENCE STATUS</small>
            <strong>
              62% <i>covered</i>
            </strong>
            <div className="bar">
              <b />
            </div>
            <em>Signals verified &nbsp; • &nbsp; gaps visible</em>
          </div>
          <div className="ui-grid">
            <span>
              Market map
              <br />
              <b>12 segments</b>
            </span>
            <span>
              Customer
              <br />
              <b>184 signals</b>
            </span>
            <span>
              Competitors
              <br />
              <b>27 mapped</b>
            </span>
            <span>
              Assumptions
              <br />
              <b>8 untested</b>
            </span>
          </div>
          <div className="ui-trace">
            DECISION TRACE
            <br />
            <b>Test pricing before building.</b>
          </div>
        </div>
      </div>
    ),
  }
);

const caps = [
  "Adaptive Interview",
  "Market & Competitive Intelligence",
  "Customer Intelligence",
  "Opportunity Scoring",
  "Assumption Ledger",
  "Experiment Lab",
  "Decision Trace",
  "Founder Copilot",
  "Continuous Market Radar",
  "Investor Mode",
];

const loop = [
  "Idea",
  "Adaptive Interview",
  "Research Engine",
  "Evidence",
  "Intelligence",
  "Opportunity Score",
  "Assumption Ledger",
  "Experiment Lab",
  "Decision Trace",
  "Market Radar",
];

const audiences = [
  "First-time founders",
  "Serial founders",
  "Student entrepreneurs",
  "Product builders",
  "Consultants",
  "Incubators",
  "Innovation teams",
];

export default function LandingView() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const l = new Lenis({ duration: 1.1, smoothWheel: true });
    let id = 0;
    const f = (t: number) => {
      l.raf(t);
      id = requestAnimationFrame(f);
    };
    id = requestAnimationFrame(f);
    return () => {
      cancelAnimationFrame(id);
      l.destroy();
    };
  }, []);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className={light ? "landing-root light-mode" : "landing-root"}>
      <Scene />

      <header>
        <button className="brand" onClick={() => go("top")} aria-label="Go to top">
          <Image
            src="/fi-logo.png"
            alt="Founder Intelligence Logo"
            width={42}
            height={42}
            priority
          />
          <span>
            Founder Intelligence
            <small>FI / INTELLIGENCE SYSTEM</small>
          </span>
        </button>

        <nav>
          <button type="button" onClick={() => go("loop")}>
            The loop
          </button>
          <button type="button" onClick={() => go("capabilities")}>
            Capabilities
          </button>
          <button type="button" onClick={() => go("audience")}>
            Who it’s for
          </button>
          <button type="button" onClick={() => go("contact")}>
            Contact
          </button>
        </nav>

        <div className="header-actions">
          <Link href="/login" className="auth-button">
            Login / Sign up
          </Link>
          <button
            className="theme-toggle"
            onClick={() => setLight((v) => !v)}
            aria-label="Toggle light mode"
            type="button"
          >
            <span>{light ? "☀" : "☾"}</span>
            <small>{light ? "Light" : "Dark"}</small>
          </button>
        </div>
      </header>

      <section id="top" className="hero">
        <div className="hero-copy">
          <div className="eyebrow">● Evidence before confidence</div>
          <h1>
            From uncertainty
            <br />
            <span>to evidence-backed</span>
            <br />
            decisions.
          </h1>
          <p>
            Founder Intelligence is an AI-native market intelligence and decision
            platform that turns an idea into evidence-backed market understanding
            and a clear next action.
          </p>
          <div className="actions">
            <button type="button" onClick={() => go("contact")}>
              Talk to us ↗
            </button>
            <button
              type="button"
              className="text-btn"
              onClick={() => go("loop")}
            >
              See the intelligence loop ↓
            </button>
          </div>
          <div className="markets">
            DUBAI / UAE&nbsp;&nbsp;&nbsp; INDIA&nbsp;&nbsp;&nbsp; GLOBAL BY
            DESIGN
          </div>
        </div>
        <div className="hero-device">
          <Device />
        </div>
      </section>

      <section className="section problem">
        <div>
          <div className="eyebrow">01 / THE PROBLEM</div>
          <h2>
            Too much information.
            <br />
            <span>Not enough understanding.</span>
          </h2>
        </div>
        <div className="card-grid">
          {[
            [
              "Is the problem real?",
              "Collect customer language, pain signals, reviews and evidence.",
            ],
            [
              "Who is the real customer?",
              "Build an evidence-backed segment map instead of inventing personas.",
            ],
            [
              "What is the gap?",
              "Find unmet jobs, complaints, workarounds and whitespace.",
            ],
            [
              "Can I trust the answer?",
              "Separate evidence, inference, assumptions and recommendations.",
            ],
          ].map((x, i) => (
            <motion.article
              className="glass-card"
              key={i}
              whileHover={{ y: -8, rotateX: 2 }}
            >
              <small>0{i + 1}</small>
              <h3>{x[0]}</h3>
              <p>{x[1]}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="section definition">
        <div className="definition-copy">
          <div className="eyebrow">02 / WHAT FI IS</div>
          <h2>
            A decision system,
            <br />
            <span>not a report generator.</span>
          </h2>
          <p>
            Founder Intelligence connects adaptive discovery, multi-stage
            research, evidence architecture, market intelligence, opportunity
            scoring, assumptions, experiments and decision trace into one
            continuously updated intelligence layer.
          </p>
        </div>
        <div className="definition-visual">
          <div className="intelligence-stack">
            <div>
              <small>01</small>
              <b>Evidence</b>
              <span>Signals collected</span>
            </div>
            <div>
              <small>02</small>
              <b>Context</b>
              <span>Patterns connected</span>
            </div>
            <div>
              <small>03</small>
              <b>Decision</b>
              <span>Next action surfaced</span>
            </div>
          </div>
        </div>
      </section>

      <section id="loop" className="section">
        <div className="eyebrow">03 / INTELLIGENCE LOOP</div>
        <h2>
          Research becomes useful when
          <br />
          <span>it changes a decision.</span>
        </h2>
        <div className="loop-grid">
          {loop.map((x, i) => (
            <div className="loop-card" key={x}>
              <small>0{i + 1}</small>
              <b>{x}</b>
            </div>
          ))}
        </div>
      </section>

      <section id="capabilities" className="section">
        <div className="eyebrow">04 / CAPABILITIES</div>
        <h2>
          Everything connected to
          <br />
          <span>what should we do next?</span>
        </h2>
        <div className="cap-grid">
          {caps.map((x, i) => (
            <article className="glass-card cap" key={x}>
              <small>0{i + 1}</small>
              <div>✦</div>
              <h3>{x}</h3>
              <p>Evidence, context and a traceable path to the next action.</p>
            </article>
          ))}
        </div>
      </section>

      <section id="audience" className="section audience">
        <div className="eyebrow">05 / BUILT FOR PEOPLE MAKING DECISIONS</div>
        <h2>
          One intelligence layer.
          <br />
          <span>Many kinds of builders.</span>
        </h2>
        <div className="audience-grid">
          {audiences.map((x, i) => (
            <div className="glass-card audience-card" key={x}>
              <small>0{i + 1}</small>
              <b>{x}</b>
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="contact-section section">
        <div className="contact-box">
          <div>
            <div className="eyebrow">06 / CONTACT US</div>
            <h2>
              Have an idea?
              <br />
              <span>Let’s explore it.</span>
            </h2>
            <p>
              Tell us what you are building, researching, or trying to
              understand. We’ll help you figure out the next useful step.
            </p>
          </div>
          <div className="contact-actions">
            <div className="contact-note">
              Ready to turn uncertainty into something you can act on?
            </div>
            <button type="button" onClick={() => go("top")}>
              Start a conversation ↗
            </button>
          </div>
        </div>
      </section>

      <section id="cta" className="final">
        <div className="final-glow" />
        <div className="final-copy">
          <div className="eyebrow">
            DEZAI TECHNOLOGIES × THE FIRST BRICK COMMUNITY
          </div>
          <h2>
            Know what you know.
            <br />
            <span>Know what you don’t.</span>
          </h2>
          <p>
            Research the market. Challenge the idea. Find the gap. Prove what
            matters. Decide what to build.
          </p>
          <button type="button" onClick={() => go("contact")}>
            Talk to the FI team ↗
          </button>
        </div>
      </section>

      <footer>
        FOUNDER INTELLIGENCE / FI&nbsp;&nbsp; • &nbsp;&nbsp;EVIDENCE BEFORE
        CONFIDENCE&nbsp;&nbsp; • &nbsp;&nbsp;DUBAI / UAE + INDIA
      </footer>
    </main>
  );
}
