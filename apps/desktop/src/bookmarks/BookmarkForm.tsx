import { useState, type FormEvent } from 'react';
import TagInput from '@/components/TagInput';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface BookmarkFormValues {
  url: string;
  title: string;
  tags: string[];
  description: string;
}

interface Props {
  idPrefix: string;
  initialValues: BookmarkFormValues;
  submitLabel: string;
  pendingLabel: string;
  errorMessage?: string;
  isPending: boolean;
  tagSuggestions: string[];
  onCancel: () => void;
  onSubmit: (values: BookmarkFormValues) => void;
}

export default function BookmarkForm({
  idPrefix,
  initialValues,
  submitLabel,
  pendingLabel,
  errorMessage,
  isPending,
  tagSuggestions,
  onCancel,
  onSubmit,
}: Props) {
  const [url, setUrl] = useState(initialValues.url);
  const [title, setTitle] = useState(initialValues.title);
  const [tags, setTags] = useState(initialValues.tags);
  const [description, setDescription] = useState(initialValues.description);
  const isUrlMissing = !url.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isUrlMissing || isPending) return;

    onSubmit({
      url: url.trim(),
      title: title.trim(),
      tags,
      description: description.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldGroup>
        <Field data-invalid={isUrlMissing || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-url`}>URL</FieldLabel>
          <Input
            id={`${idPrefix}-url`}
            placeholder="https://example.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={isPending}
            aria-invalid={isUrlMissing}
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-title`}>标题（可选）</FieldLabel>
          <Input
            id={`${idPrefix}-title`}
            placeholder="书签标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isPending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-tags`}>标签（可选）</FieldLabel>
          <TagInput
            inputId={`${idPrefix}-tags`}
            value={tags}
            onChange={setTags}
            suggestions={tagSuggestions}
            disabled={isPending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-description`}>描述（可选）</FieldLabel>
          <Textarea
            id={`${idPrefix}-description`}
            placeholder="添加备注或描述"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isPending}
          />
        </Field>
        {errorMessage && <FieldError role="alert">{errorMessage}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          取消
        </Button>
        <Button type="submit" disabled={isUrlMissing || isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
