// ============================================================================
// Transactions (Worker) — halaman tersendiri, bukan bagian dari dashboard.
// Menampilkan SEMUA tx terkait escrow dari pembuatan sampai pembayaran.
// ============================================================================
import Layout from "../../components/Layout";
import TxLog from "../../components/TxLog";

export default function WorkerTransactions() {
  return (
    <Layout
      role="worker"
      title="Transactions"
      subtitle="All transactions — from creating escrow to paying out"
      active="/worker/transactions"
    >
      <TxLog />
    </Layout>
  );
}