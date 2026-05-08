import { KnowledgeLayout } from '../components/KnowledgeLayout';
import { ADMIN_GUIDE_SECTIONS } from '../data/knowledgeBase';
import { useAppStore } from '../stores/appStore';
import { ShieldX } from 'lucide-react';

export function AdminGuidePage() {
  const { currentUser } = useAppStore();

  // ── Access guard ─────────────────────────────────────────────────────────
  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6 py-16 bg-white dark:bg-[var(--bg)]">
        <ShieldX size={40} className="text-red-400" />
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-1">
            Admin Access Required
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This guide is only visible to administrators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <KnowledgeLayout
        title="Admin Technical Guide"
        subtitle="System Reference"
        sections={ADMIN_GUIDE_SECTIONS}
      />
    </div>
  );
}
