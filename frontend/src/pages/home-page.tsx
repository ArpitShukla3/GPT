import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  Globe,
  FileText,
  Eye,
  Activity,
  ShieldAlert,
  Cpu,
  Cloud,
  Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import ShootingStarsBackground from '@/components/starry-background'

const features = [
  {
    icon: Bot,
    title: 'Advanced AI Chat',
    description: 'Engage with state-of-the-art language models. Stream responses dynamically and manage saved conversations.',
    badge: 'Core',
  },
  {
    icon: Globe,
    title: 'Live Web Search',
    description: 'Search articles, query news, and pull up-to-date real-time context from the internet to ground answers.',
    badge: 'Internet',
  },
  {
    icon: FileText,
    title: 'PDF Extraction',
    description: 'Upload and parse PDFs directly. Query books, summarize transcripts, and analyze documents instantly.',
    badge: 'Documents',
  },
  {
    icon: Eye,
    title: 'Multimodal Vision',
    description: 'Process diagrams, read images, and extract insights from visual data in your conversation thread.',
    badge: 'Vision',
  },
  {
    icon: Activity,
    title: 'Self-Healing RAG',
    description: 'Multi-step query verification and corrective retrieval checks ensure highly accurate, grounded responses.',
    badge: 'Advanced',
  },
  {
    icon: ShieldAlert,
    title: 'PII Masking Layer',
    description: 'Redact names, emails, and credentials automatically before they reach external model endpoints.',
    badge: 'Security',
  },
  {
    icon: Cpu,
    title: 'Compression Middleware',
    description: 'Automatic summarization of thread histories to reduce token counts and keep latencies ultra-low.',
    badge: 'Performance',
  },
  {
    icon: Cloud,
    title: 'Hybrid Deployment',
    description: 'Run completely locally on consumer hardware for privacy, or connect to secure cloud infrastructure.',
    badge: 'Flexible',
  },
]

function HomePage() {
  return (
    <>
      <ShootingStarsBackground />
      <div className="fixed top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      <main className="relative z-10 min-h-svh bg-transparent pb-16 pt-24">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          
          {/* Hero Section */}
          <header className="text-center max-w-3xl mx-auto space-y-6 mb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary backdrop-blur-md">
              <Sparkles className="size-3.5" />
              <span>Secure, Thread-Aware AI Workspace</span>
            </div>
            
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl md:text-7xl">
              Next-Gen{' '}
              <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                AI Chat
              </span>
            </h1>
            
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl">
              An intelligent assistant equipped with web search, PDF/image vision, self-healing RAG, PII anonymization, and sliding-window context compression. Run locally or in the cloud.
            </p>

            <div className="flex flex-wrap gap-4 justify-center pt-4">
              <Button asChild size="lg" className="h-12 rounded-2xl px-6 shadow-lg shadow-primary/20 transition-transform duration-200 hover:scale-[1.02]">
                <Link to="/signup">
                  Start Chatting Free
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 rounded-2xl px-6 backdrop-blur transition-transform duration-200 hover:scale-[1.02]">
                <Link to="/login">Sign In</Link>
              </Button>
            </div>
          </header>

          {/* Features Grid */}
          <section className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Supercharged Abstractions
              </h2>
              <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                Features engineered for accuracy, compliance, and optimized context.
              </p>
            </div>

            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mt-8">
              {features.map((item) => {
                const Icon = item.icon

                return (
                  <div
                    key={item.title}
                    className="group relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/90 p-6 shadow-2xl shadow-black/5 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-primary/5"
                  >
                    {/* Inner glowing effect */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.14),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(244,114,182,0.12),_transparent_30%)] opacity-80" />
                    
                    <div className="relative z-10 flex h-full flex-col justify-between gap-6">
                      <div className="flex justify-between items-start">
                        <div className="rounded-2xl border border-border bg-background/80 p-3 text-foreground shadow-sm group-hover:scale-110 group-hover:text-primary transition-all duration-300">
                          <Icon className="size-5" />
                        </div>
                        <span className="text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {item.badge}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <h3 className="font-semibold text-lg text-foreground tracking-tight">
                          {item.title}
                        </h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Footer branding */}
          <footer className="mt-20 pt-8 border-t border-border/30 text-center text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} aiChat workspace. Powered by self-healing retrieval networks.</p>
          </footer>

        </div>
      </main>
    </>
  )
}

export default HomePage
