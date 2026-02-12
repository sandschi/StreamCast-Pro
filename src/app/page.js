'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Sparkles, Shield, Zap, Users, CheckCircle, Clock, ExternalLink } from 'lucide-react';

export default function Home() {
  const { user, loginWithTwitch, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !loading) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-zinc-950 to-zinc-950" />
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-40" />

      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-zinc-800/50 backdrop-blur-sm bg-zinc-950/50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/20">
                <img src="/logo.png" alt="StreamCast Logo" className="w-full h-full object-cover rounded-lg" />
              </div>
              <span className="font-bold text-xl tracking-tight">STREAMCAST PRO</span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={loginWithTwitch}
              className="px-6 py-2.5 bg-[#9146FF] hover:bg-[#7c3aeb] text-white font-bold rounded-lg transition-all shadow-lg flex items-center gap-2"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" /></svg>
              Sign In
            </motion.button>
          </div>
        </header>

        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 py-20 md:py-32">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600/10 border border-purple-500/20 rounded-full">
                <Sparkles size={16} className="text-purple-400" />
                <span className="text-sm font-bold text-purple-400 uppercase tracking-wider">Premium Overlay System</span>
              </div>
              <h1 className="text-5xl md:text-6xl font-black leading-tight">
                Elevate Your Stream with{' '}
                <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Dynamic Overlays
                </span>
              </h1>
              <p className="text-xl text-zinc-400 leading-relaxed">
                StreamCast Pro transforms your Twitch chat into stunning, animated on-screen messages.
                Engage your audience like never before with fully customizable overlays that bring your stream to life.
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={loginWithTwitch}
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold rounded-xl transition-all shadow-2xl shadow-purple-500/50 flex items-center gap-3 text-lg"
              >
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" /></svg>
                Get Started Free
                <ExternalLink size={20} />
              </motion.button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="aspect-video bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden backdrop-blur-sm">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAyMCAwIEwgMCAwIDAgMjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50" />
                <div className="relative p-8 flex items-center justify-center h-full">
                  <div className="text-center space-y-4">
                    <MessageSquare size={64} className="mx-auto text-purple-400" />
                    <p className="text-2xl font-bold">Live Chat Overlay Preview</p>
                    <p className="text-zinc-400">Fully customizable animations & styles</p>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-purple-600/20 rounded-full blur-3xl" />
              <div className="absolute -top-4 -left-4 w-32 h-32 bg-pink-600/20 rounded-full blur-3xl" />
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-black mb-4">Powerful Features</h2>
            <p className="text-xl text-zinc-400">Everything you need to create professional stream overlays</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Sparkles className="w-8 h-8" />,
                title: 'Custom Animations',
                description: 'Choose from slide, fade, zoom, and bounce animations. Fully customize colors, fonts, and timing.',
                color: 'purple'
              },
              {
                icon: <Zap className="w-8 h-8" />,
                title: 'Real-Time Chat',
                description: 'Instantly display Twitch messages on your stream with support for emotes and custom styling.',
                color: 'yellow'
              },
              {
                icon: <Users className="w-8 h-8" />,
                title: 'Team Management',
                description: 'Invite moderators to help manage your overlay. Control permissions and access levels.',
                color: 'blue'
              },
              {
                icon: <Shield className="w-8 h-8" />,
                title: 'Moderation Tools',
                description: 'Review and approve messages before they appear. Keep your stream safe and professional.',
                color: 'green'
              },
              {
                icon: <MessageSquare className="w-8 h-8" />,
                title: 'Message History',
                description: 'Access your entire message history. Re-send previous messages with a single click.',
                color: 'pink'
              },
              {
                icon: <CheckCircle className="w-8 h-8" />,
                title: 'Multiple Styles',
                description: '8+ bubble styles including Glass, Neon, Cyberpunk, Comic, and more. Match your brand perfectly.',
                color: 'indigo'
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -5 }}
                className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl backdrop-blur-sm hover:border-zinc-700 transition-all"
              >
                <div className={`w-16 h-16 bg-${feature.color}-600/10 border border-${feature.color}-500/20 rounded-xl flex items-center justify-center mb-4 text-${feature.color}-400`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-zinc-400 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-black mb-4">Getting Started</h2>
            <p className="text-xl text-zinc-400">Join StreamCast Pro in three simple steps</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connection Lines */}
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-600/50 via-pink-600/50 to-purple-600/50 -translate-y-1/2" />

            {[
              {
                step: '01',
                title: 'Sign Up with Twitch',
                description: 'Connect your Twitch account securely using OAuth. No passwords needed.',
                icon: <svg className="w-12 h-12 fill-current" viewBox="0 0 24 24"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" /></svg>
              },
              {
                step: '02',
                title: 'Wait for Approval',
                description: 'Your application will be manually reviewed by Sandschi. This usually takes 24-48 hours.',
                icon: <Clock className="w-12 h-12" />
              },
              {
                step: '03',
                title: 'Start Streaming',
                description: 'Once approved, customize your overlay and add it to OBS. It\'s completely free!',
                icon: <Sparkles className="w-12 h-12" />
              }
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="relative"
              >
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center relative z-10">
                  <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-6 text-white shadow-lg shadow-purple-500/50">
                    {step.icon}
                  </div>
                  <div className="text-6xl font-black text-zinc-800 mb-4">{step.step}</div>
                  <h3 className="text-2xl font-bold mb-3">{step.title}</h3>
                  <p className="text-zinc-400 leading-relaxed">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="max-w-4xl mx-auto px-6 py-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 border border-purple-500/20 rounded-3xl p-12 text-center backdrop-blur-sm relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />
            <div className="relative z-10 space-y-6">
              <h2 className="text-4xl md:text-5xl font-black">Ready to Transform Your Stream?</h2>
              <p className="text-xl text-zinc-300">Join StreamCast Pro today. It's completely free during beta!</p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={loginWithTwitch}
                className="px-10 py-5 bg-white text-purple-900 font-black rounded-xl transition-all shadow-2xl hover:shadow-purple-500/50 text-lg inline-flex items-center gap-3"
              >
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" /></svg>
                Connect with Twitch
              </motion.button>
              <p className="text-sm text-zinc-400">
                <Shield size={16} className="inline mr-1" />
                Manual approval required • Free during beta • No credit card needed
              </p>
            </div>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="border-t border-zinc-800/50 mt-20">
          <div className="max-w-7xl mx-auto px-6 py-8 text-center text-zinc-500 text-sm">
            <p>© 2026 StreamCast Pro. Built with ❤️ for the Twitch community.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
