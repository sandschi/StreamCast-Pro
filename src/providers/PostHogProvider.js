'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function PostHogProvider({ children }) {
    useEffect(() => {
        if (typeof window !== 'undefined') {
            posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
                api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
                person_profiles: 'identified_only',
                capture_pageview: false // Disable automatic pageview capture, as we use manual capture below
            })

            const originalConsole = {
                warn: console.warn,
                error: console.error
            };

            // Override console methods to capture logs
            const wrapConsole = (method) => {
                if (console[method].__isWrapped) return;

                const original = originalConsole[method];
                console[method] = (...args) => {
                    const message = args.map(arg => {
                        try {
                            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                        } catch (e) {
                            return String(arg)
                        }
                    }).join(' ')

                    if (posthog) {
                        posthog.capture(`console_${method}`, { message })
                    }
                    original.apply(console, args)
                }
                console[method].__isWrapped = true;
            }

            wrapConsole('warn')
            wrapConsole('error')

            // Global error handler
            const handleWindowError = (event) => {
                if (posthog) {
                    posthog.capture('$exception', {
                        message: event.message,
                        source: event.filename,
                        lineno: event.lineno,
                        colno: event.colno,
                        error: event.error ? event.error.stack : null
                    })
                }
            };
            window.addEventListener('error', handleWindowError);

            // Unhandled promise rejection
            const handleUnhandledRejection = (event) => {
                if (posthog) {
                    posthog.capture('$exception', {
                        message: event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled Promise Rejection',
                        error: event.reason && event.reason.stack ? event.reason.stack : null
                    })
                }
            };
            window.addEventListener('unhandledrejection', handleUnhandledRejection);

            // Cleanup function to avoid memory leaks and double-wrapping in StrictMode
            return () => {
                console.warn = originalConsole.warn;
                console.error = originalConsole.error;
                window.removeEventListener('error', handleWindowError);
                window.removeEventListener('unhandledrejection', handleUnhandledRejection);
            };
        }
    }, [])

    return (
        <PHProvider client={posthog}>
            <Suspense fallback={null}>
                <PostHogPageview />
            </Suspense>
            {children}
        </PHProvider>
    )
}

function PostHogPageview() {
    const pathname = usePathname()
    const searchParams = useSearchParams()

    useEffect(() => {
        if (pathname && posthog) {
            let url = window.origin + pathname
            if (searchParams.toString()) {
                url = url + `?${searchParams.toString()}`
            }

            posthog.capture('$pageview', {
                $current_url: url,
            })
        }
    }, [pathname, searchParams])

    return null
}
