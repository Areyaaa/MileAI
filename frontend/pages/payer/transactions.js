// ============================================================================
// Transactions (Payer) — halaman tersendiri, bukan bagian dari dashboard.
// Menampilkan SEMUA tx terkait escrow dari pembuatan sampai pembayaran.
// ============================================================================
import Layout from "../../components/Layout";
import TxLog from "../../components/TxLog";

export default function PayerTransactions() {
  return (
    <Layout
      role="payer"
      title="Transactions"
      subtitle="All transactions — from creating escrow to paying out"
      active="/payer/transactions"
    >
      <TxLog />
    </Layout>
  );
}