/**
 * Email Router & Templates
 * ────────────────────────
 * Routes emails to the first available provider.
 * Provides pre-built templates for common scenarios.
 */

import type { EmailProvider, EmailMessage, EmailResult, EmailProviderName } from './types';
import { ResendProvider } from './resend';
import { SendGridProvider } from './sendgrid';
import { IntegrationError } from '../types';

export class EmailRouter {
  private providers: Map<EmailProviderName, EmailProvider> = new Map();
  private defaultFrom = process.env.EMAIL_FROM || 'BlinkGo <noreply@blinkgo.com>';

  constructor() {
    this.providers.set('resend', new ResendProvider());
    this.providers.set('sendgrid', new SendGridProvider());
  }

  /**
   * Get the first enabled provider (priority: resend > sendgrid).
   * Production email is sent via Resend through lib/email-service.ts.
   */
  getDefault(): EmailProvider {
    const priority: EmailProviderName[] = ['resend', 'sendgrid'];
    for (const name of priority) {
      const p = this.providers.get(name);
      if (p?.enabled) return p;
    }
    throw new IntegrationError('email', 'NO_PROVIDER', 'No email provider enabled', { retryable: false });
  }

  list(): { name: EmailProviderName; enabled: boolean }[] {
    return Array.from(this.providers.entries()).map(([name, p]) => ({ name, enabled: p.enabled }));
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    const provider = this.getDefault();
    return provider.send({ ...message, from: message.from || this.defaultFrom });
  }

  // ── Templates ──────────────────────────────────

  async sendWelcome(to: string, name: string, locale: string = 'en'): Promise<EmailResult> {
    const templates = emailTemplates[locale] || emailTemplates.en;
    return this.send({
      from: this.defaultFrom,
      to,
      subject: templates.welcome.subject,
      html: templates.welcome.html(name),
      text: templates.welcome.text(name),
      tags: { type: 'welcome' },
    });
  }

  async sendPasswordReset(to: string, name: string, resetLink: string, locale: string = 'en'): Promise<EmailResult> {
    const templates = emailTemplates[locale] || emailTemplates.en;
    return this.send({
      from: this.defaultFrom,
      to,
      subject: templates.passwordReset.subject,
      html: templates.passwordReset.html(name, resetLink),
      text: templates.passwordReset.text(name, resetLink),
      tags: { type: 'password_reset' },
    });
  }

  async sendOrderConfirmation(to: string, name: string, orderId: string, total: number, restaurantName: string, locale: string = 'en'): Promise<EmailResult> {
    const templates = emailTemplates[locale] || emailTemplates.en;
    return this.send({
      from: this.defaultFrom,
      to,
      subject: 'Order ' + orderId + ' confirmed',
      html: templates.orderConfirmation.html(name, orderId, total, restaurantName),
      text: templates.orderConfirmation.text(name, orderId, total, restaurantName),
      tags: { type: 'order_confirmation', order_id: orderId },
    });
  }

  async sendDriverAssignment(to: string, name: string, orderId: string, restaurantName: string, customerAddress: string, locale: string = 'en'): Promise<EmailResult> {
    const templates = emailTemplates[locale] || emailTemplates.en;
    return this.send({
      from: this.defaultFrom,
      to,
      subject: 'New delivery: Order ' + orderId,
      html: templates.driverAssignment.html(name, orderId, restaurantName, customerAddress),
      text: templates.driverAssignment.text(name, orderId, restaurantName, customerAddress),
      tags: { type: 'driver_assignment', order_id: orderId },
    });
  }

  async sendRestaurantOnboarding(to: string, name: string, restaurantName: string, dashboardLink: string, locale: string = 'en'): Promise<EmailResult> {
    const templates = emailTemplates[locale] || emailTemplates.en;
    return this.send({
      from: this.defaultFrom,
      to,
      subject: templates.restaurantOnboarding.subject,
      html: templates.restaurantOnboarding.html(name, restaurantName, dashboardLink),
      text: templates.restaurantOnboarding.text(name, restaurantName, dashboardLink),
      tags: { type: 'restaurant_onboarding' },
    });
  }

  async sendReceipt(to: string, name: string, orderId: string, items: { name: string; qty: number; price: number }[], total: number, locale: string = 'en'): Promise<EmailResult> {
    const templates = emailTemplates[locale] || emailTemplates.en;
    return this.send({
      from: this.defaultFrom,
      to,
      subject: 'Receipt for order ' + orderId,
      html: templates.receipt.html(name, orderId, items, total),
      text: templates.receipt.text(name, orderId, items, total),
      tags: { type: 'receipt', order_id: orderId },
    });
  }
}

// ── Templates (English; can be localized) ──────────────
const emailTemplates: Record<string, {
  welcome: { subject: string; html: (n: string) => string; text: (n: string) => string };
  passwordReset: { subject: string; html: (n: string, link: string) => string; text: (n: string, link: string) => string };
  orderConfirmation: { subject: string; html: (n: string, id: string, total: number, r: string) => string; text: (n: string, id: string, total: number, r: string) => string };
  driverAssignment: { subject: string; html: (n: string, id: string, r: string, addr: string) => string; text: (n: string, id: string, r: string, addr: string) => string };
  restaurantOnboarding: { subject: string; html: (n: string, r: string, link: string) => string; text: (n: string, r: string, link: string) => string };
  receipt: { subject: string; html: (n: string, id: string, items: { name: string; qty: number; price: number }[], total: number) => string; text: (n: string, id: string, items: { name: string; qty: number; price: number }[], total: number) => string };
}> = {
  en: {
    welcome: {
      subject: 'Welcome to BlinkGo! 🎉',
      html: (n) => `<h1>Welcome, ${n}!</h1><p>Thanks for joining BlinkGo. Order from your favorite restaurants in minutes.</p><p><a href="https://blinkgo.com">Start exploring</a></p>`,
      text: (n) => `Welcome, ${n}! Thanks for joining BlinkGo. Order from your favorite restaurants in minutes.`,
    },
    passwordReset: {
      subject: 'Reset your BlinkGo password',
      html: (n, link) => `<h1>Hi ${n}</h1><p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${link}">${link}</a></p>`,
      text: (n, link) => `Hi ${n}. Reset your password: ${link} (expires in 1 hour)`,
    },
    orderConfirmation: {
      subject: 'Order confirmed ✅',
      html: (n, id, total, r) => `<h1>Thanks for your order, ${n}!</h1><p>Order #${id} from ${r} for €${total.toFixed(2)} is being prepared.</p>`,
      text: (n, id, total, r) => `Order #${id} from ${r} for €${total.toFixed(2)} confirmed.`,
    },
    driverAssignment: {
      subject: 'New delivery assignment',
      html: (n, id, r, addr) => `<h1>New delivery, ${n}!</h1><p>Pick up order #${id} from ${r}.</p><p>Deliver to: ${addr}</p>`,
      text: (n, id, r, addr) => `Pick up #${id} from ${r}. Deliver to: ${addr}`,
    },
    restaurantOnboarding: {
      subject: 'Welcome to BlinkGo!',
      html: (n, r, link) => `<h1>Welcome, ${n}!</h1><p>${r} is now live on BlinkGo.</p><p><a href="${link}">Open dashboard</a></p>`,
      text: (n, r, link) => `${r} is live on BlinkGo. Open dashboard: ${link}`,
    },
    receipt: {
      subject: 'Receipt',
      html: (n, id, items, total) => {
        const rows = items.map((i) => `<tr><td>${i.name}</td><td>${i.qty}</td><td>€${(i.price * i.qty).toFixed(2)}</td></tr>`).join('');
        return `<h1>Receipt</h1><p>Thanks, ${n}!</p><p>Order #${id}</p><table>${rows}</table><p><b>Total: €${total.toFixed(2)}</b></p>`;
      },
      text: (n, id, items, total) => `Receipt for ${n} - Order #${id}\n${items.map((i) => `${i.qty}x ${i.name} - €${(i.price * i.qty).toFixed(2)}`).join('\n')}\nTotal: €${total.toFixed(2)}`,
    },
  },
};

let _router: EmailRouter | null = null;
export function getEmailRouter(): EmailRouter {
  if (!_router) _router = new EmailRouter();
  return _router;
}
