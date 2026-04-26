import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import { styles } from "./styles";

interface PaymentSuccessProps {
  customerName?: string;
  orderNumber?: string;
  amount?: number;
  currencyCode?: string;
  paymentMethod?: string;
}

export default function PaymentSuccess({
  customerName = "Customer",
  orderNumber = "10035",
  amount = 50,
  currencyCode = "NGN",
  paymentMethod = "Paystack",
}: PaymentSuccessProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section>
            <Text style={styles.heading}>Payment Successful</Text>
            <Text style={styles.text}>
              Dear {customerName},
            </Text>
            <Text style={styles.text}>
              We have successfully received your payment for order <strong>#{orderNumber}</strong>.
            </Text>
          </Section>

          <Hr style={styles.hr} />

          <Section>
            <Text style={styles.heading}>Payment Details</Text>
            <Text style={styles.text}>
              <strong>Amount Paid:</strong> {formatCurrency(amount, currencyCode)}
            </Text>
            <Text style={styles.text}>
              <strong>Payment Method:</strong> {paymentMethod}
            </Text>
            <Text style={styles.text}>
              <strong>Order Number:</strong> #{orderNumber}
            </Text>
          </Section>

          <Hr style={styles.hr} />

          <Section>
            <Text style={styles.text}>
              Your order is now being processed and you will receive a shipping confirmation once it's on its way.
            </Text>
            <Text style={styles.text}>
              Thank you for shopping with us!
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
