import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  pending: boolean;
  onCreate(name: string): Promise<unknown>;
}

export default function NavigationCategoryComposer({ pending, onCreate }: Props) {
  const [name, setName] = useState('');
  const submit = async () => {
    try {
      await onCreate(name);
      setName('');
    } catch {
      // The controller reports mutation errors and the input remains available for retry.
    }
  };
  return (
    <header className="flex gap-2 border-b p-4">
      <Input
        aria-label="分类名称"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="新建分类"
      />
      <Button disabled={!name.trim() || pending} onClick={() => void submit()}>
        <Plus />
        新建分类
      </Button>
    </header>
  );
}
