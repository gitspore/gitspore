export function daemonPort(): number {
  return Number(process.env.PORT ?? 3001);
}
