import { sendEmail } from '../common/email';

type Delivery = {
  key: string;
  from: string;
  to: string;
  idempotencyKey: string;
  message: string;
};

export async function sendAlert(input: Delivery, transport: typeof fetch = fetch) {
  await sendEmail({
    key: input.key,
    from: input.from,
    to: input.to,
    subject: 'Alerta de Nuvex',
    text: input.message,
    idempotencyKey: input.idempotencyKey,
  }, transport);
}
