import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Globe,
  Layers,
  Search,
  Shield,
  Sparkles,
  TreePine,
  Upload,
  Zap,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

/* ── Scroll-triggered reveal ─────────────────────────────────── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('revealed'); obs.unobserve(el) } },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useReveal()
  return <div ref={ref} className={`reveal-on-scroll ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>
}

/* ── Data ─────────────────────────────────────────────────────── */
const pipeline = [
  { icon: Upload, label: 'Upload', desc: 'Drop a PDF — text is extracted and split into semantic chunks.', color: 'from-blue-500 to-cyan-400' },
  { icon: Sparkles, label: 'Extract', desc: 'A lightweight LLM pulls key facts from every chunk in parallel.', color: 'from-violet-500 to-purple-400' },
  { icon: TreePine, label: 'Build Tree', desc: 'FAISS clusters similar chunks. Multi-way merges build a semantic hierarchy.', color: 'from-emerald-500 to-teal-400' },
  { icon: Layers, label: 'Store', desc: 'Tree nodes persist in PostgreSQL + PGVector for instant restart.', color: 'from-orange-500 to-amber-400' },
  { icon: Search, label: 'Retrieve', desc: 'Your query generates retrieval questions. The tree is searched top-down.', color: 'from-rose-500 to-pink-400' },
  { icon: Bot, label: 'Answer', desc: 'Retrieved knowledge is compressed then streamed as a rich answer.', color: 'from-indigo-500 to-blue-400' },
]

const capabilities = [
  {
    icon: TreePine, title: 'Hierarchical Semantic Trees',
    desc: 'Documents become multi-level knowledge trees. Each parent preserves the meaning of its children — no information loss across abstraction levels.',
    visual: (
      <div className="flex flex-col items-center gap-2 py-4">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/30" />
        <div className="h-4 w-px bg-violet-400/40" />
        <div className="flex gap-6">
          {[0, 1].map(i => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-violet-400 to-purple-500 shadow-md" />
              <div className="h-3 w-px bg-violet-300/30" />
              <div className="flex gap-1.5">
                {[0, 1, ...(i === 1 ? [2] : [])].map(j => (
                  <div key={j} className="h-4 w-4 rounded-sm bg-violet-400/30" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: Zap, title: 'FAISS-Accelerated Clustering',
    desc: 'ANN search replaces brute-force O(N²) comparisons. KMeans pre-clusters large documents into independent sub-trees built in parallel.',
    visual: (
      <div className="flex items-center justify-center gap-3 py-4">
        {[['from-cyan-400 to-blue-500', 'C1'], ['from-emerald-400 to-teal-500', 'C2'], ['from-amber-400 to-orange-500', 'C3']].map(([g, l]) => (
          <div key={l} className="flex flex-col items-center gap-1.5">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${g} text-white text-xs font-bold shadow-lg`}>{l}</div>
            <div className="flex gap-1">{Array.from({ length: 4 }).map((_, j) => <div key={j} className="h-2 w-2 rounded-full bg-foreground/15" />)}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Shield, title: 'Privacy-First Middleware',
    desc: 'PII masking strips emails, phone numbers, and credit cards before they reach any LLM. Run fully local with Ollama for air-gapped privacy.',
    visual: (
      <div className="flex items-center justify-center py-4">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-3 font-mono text-sm">
          <span className="text-destructive line-through">arpit@email.com</span>
          <span className="text-muted-foreground">{' → '}</span>
          <span className="text-emerald-500 dark:text-emerald-400">[REDACTED]</span>
        </div>
      </div>
    ),
  },
  {
    icon: Globe, title: 'Live Web Grounding',
    desc: 'DuckDuckGo search pulls real-time information when your documents don\'t have the answer.',
    visual: (
      <div className="flex items-center justify-center gap-3 py-4">
        <div className="rounded-full bg-blue-500/10 p-2.5"><Globe className="size-5 text-blue-500 animate-[spin_8s_linear_infinite]" /></div>
        <div className="flex flex-col gap-1.5">
          <div className="h-2 w-20 rounded-full bg-blue-500/20" />
          <div className="h-2 w-16 rounded-full bg-blue-500/15" />
          <div className="h-2 w-24 rounded-full bg-blue-500/10" />
        </div>
      </div>
    ),
  },
]

const stats = [
  { value: '400×', label: 'Fewer Comparisons', sub: 'FAISS vs brute-force' },
  { value: '3×', label: 'Fewer LLM Calls', sub: '4-way multi-merge' },
  { value: '4', label: 'Parallel Workers', sub: 'ThreadPoolExecutor' },
  { value: '6', label: 'Pipeline Phases', sub: 'Extract → Answer' },
]

/* ── Page ─────────────────────────────────────────────────────── */
function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">

      {/* Fixed nav */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-4 bg-background/70 backdrop-blur-xl border-b border-border/40">
        <div className="flex items-center gap-2">
          <TreePine className="size-5 text-primary" />
          <span className="text-sm font-bold tracking-tight">NexusRAG</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link to="/login">Sign In</Link></Button>
          <Button asChild size="sm" className="rounded-full px-5"><Link to="/signup">Get Started</Link></Button>
        </div>
      </nav>

      {/* ═══ HERO ═══════════════════════════════════════════════ */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
        {/* Ambient orbs */}
        <div className="pointer-events-none absolute top-1/4 left-1/4 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="pointer-events-none absolute bottom-1/4 right-1/4 h-[30rem] w-[30rem] translate-x-1/2 rounded-full bg-violet-500/8 blur-[100px]" />

        <Reveal className="space-y-6">
          <p className="text-sm font-medium tracking-[0.3em] uppercase text-primary">
            Hierarchical Retrieval-Augmented Generation
          </p>
          <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-extrabold tracking-tighter leading-[0.9]">
            Nexus<span className="bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">RAG</span>
          </h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground leading-relaxed">
            Your documents become semantic trees.<br />Your questions get precise, grounded answers.
          </p>
          <div className="flex items-center justify-center gap-4 pt-4">
            <Button asChild size="lg" className="h-14 rounded-full px-8 text-base shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 hover:scale-[1.02]">
              <Link to="/signup">Start Building <ArrowRight className="size-4 ml-1" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-14 rounded-full px-8 text-base">
              <Link to="/login">Sign In</Link>
            </Button>
          </div>
        </Reveal>

        <div className="absolute bottom-10 flex flex-col items-center gap-2 text-muted-foreground/50 animate-bounce">
          <span className="text-xs tracking-widest uppercase">Scroll</span>
          <ChevronDown className="size-4" />
        </div>
      </section>

      {/* ═══ PROBLEM / SOLUTION ═════════════════════════════════ */}
      <section className="relative py-32 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <Reveal>
            <p className="text-sm font-medium tracking-[0.2em] uppercase text-primary mb-4">The Problem</p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
              Traditional RAG loses context.<br />
              <span className="text-muted-foreground/50">Flat chunks can't capture meaning.</span>
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-8 sm:grid-cols-2">
            <Reveal delay={100}>
              <div className="rounded-3xl border border-destructive/15 bg-destructive/5 p-8 text-left h-full">
                <p className="text-xs font-semibold uppercase tracking-widest text-destructive mb-3">Old Way</p>
                <p className="text-2xl font-bold mb-2">Flat Chunks</p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Split → embed → retrieve top-k → hope for the best. Context is fragmented. Related ideas scatter across chunks. Token budgets overflow.
                </p>
                <div className="mt-6 flex gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-8 flex-1 rounded-md bg-destructive/10 border border-destructive/10" />
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className="rounded-3xl border border-primary/15 bg-primary/5 p-8 text-left h-full">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">NexusRAG</p>
                <p className="text-2xl font-bold mb-2">Semantic Trees</p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Chunks are clustered by meaning. An LLM merges related facts into parent nodes. The tree captures knowledge at every abstraction level.
                </p>
                <div className="mt-6 flex flex-col items-center gap-2">
                  <div className="h-6 w-full rounded-md bg-primary/15 border border-primary/15" />
                  <div className="flex gap-2 w-full">
                    <div className="h-5 flex-1 rounded-md bg-primary/10 border border-primary/10" />
                    <div className="h-5 flex-1 rounded-md bg-primary/10 border border-primary/10" />
                  </div>
                  <div className="flex gap-1.5 w-full">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-4 flex-1 rounded-sm bg-primary/8 border border-primary/8" />
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══ PIPELINE ═══════════════════════════════════════════ */}
      <section className="relative py-32 px-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent" />
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center mb-16">
            <p className="text-sm font-medium tracking-[0.2em] uppercase text-primary mb-4">How It Works</p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">Six phases. One pipeline.</h2>
            <p className="mt-4 text-muted-foreground max-w-lg mx-auto">From PDF upload to streamed answer — every step is optimized for speed and accuracy.</p>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pipeline.map((step, i) => {
              const Icon = step.icon
              return (
                <Reveal key={step.label} delay={i * 80}>
                  <div className="group rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 transition-all duration-500 hover:border-primary/20 hover:bg-card/80 hover:shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${step.color} shadow-lg`}>
                        <Icon className="size-5 text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground font-mono">Phase {i + 1}</p>
                        <p className="text-base font-semibold">{step.label}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ═══ STATS ══════════════════════════════════════════════ */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-4xl grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 text-center transition-all hover:border-primary/20">
                <p className="text-4xl font-extrabold bg-gradient-to-b from-foreground to-foreground/50 bg-clip-text text-transparent">{s.value}</p>
                <p className="mt-1 text-sm font-medium text-foreground/70">{s.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{s.sub}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ CAPABILITIES ═══════════════════════════════════════ */}
      <section className="relative py-32 px-6">
        <div className="mx-auto max-w-5xl">
          <Reveal className="text-center mb-20">
            <p className="text-sm font-medium tracking-[0.2em] uppercase text-primary mb-4">Capabilities</p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">Every layer, engineered.</h2>
          </Reveal>

          <div className="space-y-24">
            {capabilities.map((cap, i) => {
              const Icon = cap.icon
              const flip = i % 2 !== 0
              return (
                <Reveal key={cap.title}>
                  <div className={`flex flex-col gap-10 md:flex-row md:items-center ${flip ? 'md:flex-row-reverse' : ''}`}>
                    <div className="flex-1 space-y-4">
                      <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-3 py-1">
                        <Icon className="size-3.5 text-primary" />
                        <span className="text-xs font-medium text-muted-foreground">{cap.title}</span>
                      </div>
                      <h3 className="text-3xl font-bold tracking-tight">{cap.title}</h3>
                      <p className="text-base text-muted-foreground leading-relaxed max-w-md">{cap.desc}</p>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <div className="w-full max-w-sm rounded-3xl border border-border/40 bg-card/60 backdrop-blur-sm p-8">{cap.visual}</div>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ═══ TECH STACK ═════════════════════════════════════════ */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-4xl">
          <Reveal className="text-center mb-12">
            <p className="text-sm font-medium tracking-[0.2em] uppercase text-primary mb-4">Stack</p>
            <h2 className="text-3xl font-bold tracking-tight">Built with modern infrastructure</h2>
          </Reveal>
          <Reveal>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {['React 19', 'FastAPI', 'LangGraph', 'PostgreSQL', 'PGVector', 'FAISS', 'Ollama', 'OpenRouter', 'Vite', 'TailwindCSS', 'SQLAlchemy', 'scikit-learn'].map(t => (
                <span key={t} className="rounded-full border border-border/60 bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">{t}</span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ CTA ════════════════════════════════════════════════ */}
      <section className="relative py-32 px-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent" />
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-5xl sm:text-6xl font-extrabold tracking-tight">Ready to build?</h2>
          <p className="mt-4 text-lg text-muted-foreground">Upload your first document and see hierarchical retrieval in action.</p>
          <div className="mt-8">
            <Button asChild size="lg" className="h-14 rounded-full px-10 text-base shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 hover:scale-[1.02]">
              <Link to="/signup">Get Started Free <ArrowRight className="size-4 ml-1" /></Link>
            </Button>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8 px-6 text-center">
        <p className="text-xs text-muted-foreground/50">© {new Date().getFullYear()} NexusRAG — Hierarchical Retrieval-Augmented Generation</p>
      </footer>

      {/* Reveal animation CSS */}
      <style>{`
        .reveal-on-scroll {
          opacity: 0;
          transform: translateY(40px);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .reveal-on-scroll.revealed {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </div>
  )
}

export default HomePage
