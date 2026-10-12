export function Later(props: { title: string; text: string }) {
  return (
    <section className="px-4 pt-2">
      <h1 className="screen-title mt-2 mb-2">{props.title}</h1>
      <p className="body text-ink-muted m-0">{props.text}</p>
    </section>
  )
}
