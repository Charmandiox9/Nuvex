export const cookieOptions = () => ({
  httpOnly: true, sameSite: 'strict' as const, path: '/',
  secure: process.env.PUBLIC_ORIGIN?.startsWith('https:') ?? true,
});
