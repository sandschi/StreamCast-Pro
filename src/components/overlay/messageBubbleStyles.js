export function getAnimationVariants(settings) {
    const isRightPart = settings.posX > 50;
    const isCenterPart = settings.posX > 40 && settings.posX < 60;

    switch (settings.animationStyle) {
        case 'fade': return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
        case 'zoom': return { initial: { opacity: 0, scale: 0.5 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.5 } };
        case 'bounce': return { initial: { opacity: 0, y: 100 }, animate: { opacity: 1, y: 0, transition: { type: 'spring', damping: 10 } }, exit: { opacity: 0, scale: 0.8 } };
        case 'slide':
        default: {
            const xOffset = isCenterPart ? 0 : (isRightPart ? 100 : -100);
            const yOffset = isCenterPart ? 50 : 0;
            return {
                initial: { x: xOffset, y: yOffset, opacity: 0 },
                animate: { x: 0, y: 0, opacity: 1 },
                exit: { x: -xOffset, opacity: 0 }
            };
        }
    }
}

export function getBubbleStyles(settings, messageColor) {
    const baseHeaderRadiusLeft = (settings.posX <= 40) ? '0' : `${settings.borderRadius}px`;
    const baseHeaderRadiusRight = (settings.posX > 60) ? '0' : `${settings.borderRadius}px`;
    const baseBodyRadiusLeft = (settings.posX <= 40) ? '0' : `${settings.borderRadius}px`;
    const baseBodyRadiusRight = (settings.posX > 60) ? '0' : `${settings.borderRadius}px`;

    const commonBodyStyles = {
        borderTopLeftRadius: baseBodyRadiusLeft,
        borderTopRightRadius: baseBodyRadiusRight,
        borderBottomLeftRadius: `${settings.borderRadius}px`,
        borderBottomRightRadius: `${settings.borderRadius}px`,
    };

    const commonHeaderStyles = {
        borderTopLeftRadius: baseHeaderRadiusLeft,
        borderTopRightRadius: baseHeaderRadiusRight,
        color: '#fff',
    };

    const headerBgColor = messageColor || '#9146FF';
    const headerShadowColor = messageColor || 'rgba(145, 70, 255, 0.7)';

    switch (settings.bubbleStyle) {
        case 'cyberpunk':
            return {
                header: {
                    ...commonHeaderStyles,
                    backgroundColor: '#ff003c',
                    clipPath: 'polygon(0% 15%, 15% 0%, 100% 0%, 100% 85%, 85% 100%, 0% 100%)',
                    boxShadow: `0 0 20px #ff003c`,
                    border: 'none',
                    padding: '10px 20px',
                },
                body: {
                    ...commonBodyStyles,
                    backgroundColor: 'rgba(0,0,0,0.9)',
                    border: '2px solid #00f0ff',
                    clipPath: 'polygon(0% 0%, 100% 0%, 100% 85%, 95% 100%, 0% 100%)',
                    boxShadow: `inset 0 0 10px #00f0ff80`,
                }
            };
        case 'comic':
            return {
                header: {
                    ...commonHeaderStyles,
                    backgroundColor: headerBgColor,
                    border: '4px solid #000',
                    transform: 'rotate(-2deg)',
                    zIndex: 2,
                    marginBottom: '-8px'
                },
                body: {
                    ...commonBodyStyles,
                    backgroundColor: '#fff',
                    color: '#000',
                    border: '4px solid #000',
                    boxShadow: '8px 8px 0 #000',
                    backgroundImage: 'radial-gradient(#000 10%, transparent 11%)',
                    backgroundSize: '10px 10px',
                    backgroundPosition: '0 0',
                    backgroundRepeat: 'repeat',
                    zIndex: 1,
                    // Comic tail logic
                    position: 'relative',
                }
            };
        case 'retro':
            return {
                header: {
                    ...commonHeaderStyles,
                    backgroundColor: headerBgColor,
                    border: '4px solid #fff',
                    boxShadow: '4px 4px 0 #000',
                    marginBottom: '4px'
                },
                body: {
                    ...commonBodyStyles,
                    backgroundColor: '#000',
                    border: '4px solid #fff',
                    boxShadow: '4px 4px 0 #000',
                }
            };
        case 'future':
            return {
                header: {
                    ...commonHeaderStyles,
                    backgroundColor: 'rgba(20, 30, 48, 0.9)',
                    border: `1px solid ${headerBgColor}`,
                    borderBottom: 'none',
                    clipPath: 'polygon(0% 0%, 90% 0%, 100% 50%, 90% 100%, 0% 100%)',
                    paddingRight: '30px'
                },
                body: {
                    ...commonBodyStyles,
                    backgroundColor: 'rgba(11, 22, 34, 0.85)',
                    backdropFilter: 'blur(10px)',
                    border: `1px solid ${headerBgColor}44`,
                    boxShadow: `0 0 30px ${headerBgColor}22`,
                    backgroundImage: `linear-gradient(rgba(18, 113, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(18, 113, 255, 0.05) 1px, transparent 1px)`,
                    backgroundSize: '20px 20px',
                }
            };
        case 'glass':
            return {
                header: {
                    ...commonHeaderStyles,
                    backgroundColor: '#07fc03',
                    color: '#000',
                    fontWeight: '900',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderRadius: '9999px',
                    padding: '6px 20px',
                    boxShadow: '0 0 15px rgba(7,252,3,0.4)',
                    marginBottom: '-8px',
                    zIndex: 20
                },
                body: {
                    ...commonBodyStyles,
                    backgroundColor: 'rgba(10, 10, 10, 0.7)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(39, 39, 42, 0.4)',
                    borderRadius: '24px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                    zIndex: 10
                }
            };
        case 'neon':
            return {
                header: {
                    ...commonHeaderStyles,
                    backgroundColor: headerBgColor,
                    boxShadow: `0 0 15px 5px ${headerShadowColor}`,
                    borderBottom: 'none',
                },
                body: {
                    ...commonBodyStyles,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: `0 0 10px 3px ${headerShadowColor}80`,
                }
            };
        case 'minimal':
            return {
                header: {
                    ...commonHeaderStyles,
                    backgroundColor: headerBgColor,
                    borderBottom: 'none',
                },
                body: {
                    ...commonBodyStyles,
                    backgroundColor: 'rgba(0,0,0,0.9)',
                    border: 'none',
                }
            };
        case 'bold':
            return {
                header: {
                    ...commonHeaderStyles,
                    backgroundColor: headerBgColor,
                    borderBottom: `3px solid ${settings.strokeColor}`,
                },
                body: {
                    ...commonBodyStyles,
                    backgroundColor: 'rgba(0,0,0,0.95)',
                    border: `3px solid ${settings.strokeColor}`,
                    borderTop: 'none',
                }
            };
        case 'classic':
        default:
            return {
                header: {
                    ...commonHeaderStyles,
                    backgroundColor: '#18181b', // Solid Zinc-900 for classic
                    border: '1px solid rgba(39, 39, 42, 0.5)',
                    borderBottom: 'none',
                    zIndex: 20
                },
                body: {
                    ...commonBodyStyles,
                    backgroundColor: 'rgba(10, 10, 10, 0.6)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(39, 39, 42, 0.3)',
                    borderRadius: '16px',
                    zIndex: 10
                }
            };
    }
}
