import EntryClient from "./EntryClient";

export default async function Page({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const p = await params;
  return <EntryClient id={p.id} />;
}