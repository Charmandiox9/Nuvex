type Delivery = {
  key: string;
  from: string;
  to: string;
  idempotencyKey: string;
  message: string;
};

export async function sendAlert(input: Delivery, transport: typeof fetch = fetch) {
  const response = await transport('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: 'Bearer ' + input.key,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({ from: input.from, to: [input.to], subject: 'Alerta de Nuvex', text: input.message }),
  });
  if (!response.ok) throw new Error('Resend no pudo entregar el aviso.');
}
