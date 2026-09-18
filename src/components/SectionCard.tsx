import { ReactNode } from 'react';

interface Props {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SectionCard({ title, action, children }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-1.5">
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
