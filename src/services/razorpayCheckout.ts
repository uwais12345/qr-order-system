export interface RazorpayCheckoutOptions {
  keyId: string;
  amountPaise: number;
  currency: string;
  restaurantName: string;
  orderNumber: string;
  providerOrderId: string;
  customerName: string;
  customerPhone: string;
}

export interface RazorpayCheckoutResult {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (resp: any) => void) => void;
    };
  }
}

let scriptPromise: Promise<boolean> | null = null;

function loadRazorpaySdk(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export async function openRazorpayCheckout(
  opts: RazorpayCheckoutOptions
): Promise<RazorpayCheckoutResult> {
  const loaded = await loadRazorpaySdk();
  if (!loaded || !window.Razorpay) {
    throw new Error('Unable to load Razorpay Checkout SDK. Please verify network connectivity.');
  }

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: opts.keyId,
      amount: opts.amountPaise,
      currency: opts.currency,
      name: opts.restaurantName,
      description: `Order ${opts.orderNumber}`,
      order_id: opts.providerOrderId,
      prefill: {
        name: opts.customerName,
        contact: opts.customerPhone,
      },
      theme: { color: '#087F5B' },
      handler: (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        resolve({
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => {
          reject(new Error('Payment cancelled by user before completion.'));
        },
      },
    });

    rzp.on('payment.failed', (resp: { error?: { description?: string } }) => {
      reject(new Error(resp?.error?.description || 'Payment failed at gateway.'));
    });

    rzp.open();
  });
}
