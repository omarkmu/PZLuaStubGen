import winston from 'winston'

export const Logger = winston.createLogger({
    level: 'info',
    format: winston.format.errors({ stack: true }),
    transports: [
        new winston.transports.Console({
            forceConsole: true,
            format: winston.format.printf((log): string => {
                const level = (log.level ?? 'info').toUpperCase()
                if (level !== 'INFO' && level !== 'VERBOSE') {
                    return `[${level}] ${log.message}`
                }

                return log.message as string
            }),
        }),
    ],
})
