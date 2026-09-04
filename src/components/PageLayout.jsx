export default function PageLayout({ title, children }) {
  return (
    <>
      {title ? <h1 className="page-title">{title}</h1> : null}
      {children}
    </>
  )
}
