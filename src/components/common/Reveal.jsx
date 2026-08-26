import { useReveal } from '../../hooks/useReveal'

// <Reveal> — wraps content that should rise + fade in when it scrolls into view.
// <Reveal group> — its direct children stagger in one after another.
//
// Usage:
//   <Reveal>...</Reveal>                          single element
//   <Reveal group className="grid ...">...</Reveal>   staggered children
//   <Reveal delay={120}>...</Reveal>              hold before revealing
//   <Reveal as="section">...</Reveal>             render a different tag
//
// Motion is CSS-driven (see index.css: `.reveal` / `.reveal-group`) and fully
// respects prefers-reduced-motion. Pass any other prop (to, onClick, id…) and it
// forwards to the rendered element.
export default function Reveal({
  as: Tag = 'div',
  group = false,
  delay = 0,
  className = '',
  style,
  children,
  ...rest
}) {
  const ref = useReveal()
  const base = group ? 'reveal-group' : 'reveal'
  const mergedStyle = delay ? { ...style, '--reveal-delay': `${delay}ms` } : style

  return (
    <Tag ref={ref} className={`${base} ${className}`.trim()} style={mergedStyle} {...rest}>
      {children}
    </Tag>
  )
}
