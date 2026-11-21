export type Email = {
  key: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};

export async function sendEmail(input: Email, transport: typeof fetch = fetch) {
  const response = await transport('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: 'Bearer ' + input.key,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({ from: input.from, to: [input.to], subject: input.subject, text: input.text }),
  });
  if (!response.ok) throw new Error('Resend no pudo entregar el correo.');
}
