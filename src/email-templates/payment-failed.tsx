import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

interface PaymentFailedProps {
  customerName: string
  orderNumber: string
  amount: number
  currencyCode: string
  errorMessage: string
}

export default function PaymentFailed({
  customerName,
  orderNumber,
  amount,
  currencyCode,
  errorMessage,
}: PaymentFailedProps) {
  const amountFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount)

  return (
    <Html>
      <Head />
      <Preview>Payment Failed - Order #{orderNumber}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={box}>
            <Heading style={h1}>Payment Failed</Heading>
            <Text style={text}>Hi {customerName},</Text>
            <Text style={text}>
              Unfortunately, your payment for order #{orderNumber} could not be
              processed.
            </Text>
            <Section style={detailsBox}>
              <Text style={detailsLabel}>Order Number:</Text>
              <Text style={detailsValue}>{orderNumber}</Text>
              <Text style={detailsLabel}>Amount:</Text>
              <Text style={detailsValue}>{amountFormatted}</Text>
              <Text style={detailsLabel}>Reason:</Text>
              <Text style={detailsValue}>{errorMessage}</Text>
            </Section>
            <Text style={text}>
              Please try again using the same link, or use a different payment
              method.
            </Text>
            <Text style={text}>
              If you continue to experience issues, please contact our support
              team for assistance.
            </Text>
            <Text style={footerText}>
              Best regards,
              <br />
              Your Store Team
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
}

const box = {
  padding: "0 48px",
}

const h1 = {
  color: "#dc2626",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "40px 0 20px",
  padding: "0",
}

const text = {
  color: "#525f7f",
  fontSize: "16px",
  lineHeight: "24px",
  textAlign: "left" as const,
  marginBottom: "16px",
}

const detailsBox = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "24px",
  margin: "24px 0",
}

const detailsLabel = {
  color: "#6b7280",
  fontSize: "14px",
  fontWeight: "600",
  marginBottom: "4px",
  marginTop: "12px",
}

const detailsValue = {
  color: "#111827",
  fontSize: "16px",
  marginBottom: "0",
  marginTop: "0",
}

const footerText = {
  color: "#8898aa",
  fontSize: "14px",
  lineHeight: "20px",
  marginTop: "32px",
}
