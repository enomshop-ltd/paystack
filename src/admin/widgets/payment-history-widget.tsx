import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Table, Badge, Text } from "@medusajs/ui";

const PaymentHistoryWidget = ({ data: order }: { data: any }) => {
  const paymentCollection = order.payment_collections?.[0];
  const payments = paymentCollection?.payments || [];

  return (
    <Container className="p-6 mt-4">
      <Heading level="h2" className="mb-4">Payment History</Heading>
      {payments.length === 0 ? (
        <Text className="text-ui-fg-subtle">No payments recorded yet.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>ID</Table.HeaderCell>
              <Table.HeaderCell>Provider</Table.HeaderCell>
              <Table.HeaderCell>Amount</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {payments.map((payment: any) => (
              <Table.Row key={payment.id}>
                <Table.Cell className="font-mono text-xs">{payment.id.slice(-8)}</Table.Cell>
                <Table.Cell>
                  <Badge size="small" color={payment.provider_id === 'paystack' ? 'blue' : 'grey'}>
                    {payment.provider_id}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: payment.currency_code }).format(payment.amount)}
                </Table.Cell>
                <Table.Cell>
                  <Badge size="small" color={payment.captured_at ? 'green' : payment.canceled_at ? 'red' : 'orange'}>
                    {payment.captured_at ? 'Captured' : payment.canceled_at ? 'Canceled' : 'Pending'}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {new Date(payment.created_at).toLocaleDateString()}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.after",
});

export default PaymentHistoryWidget;
