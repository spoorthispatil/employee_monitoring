export default function IndexPage() {
  // AuthGuard in _app.tsx handles the redirect to /login or /dashboard
  // once the auth state has loaded. This page just needs to exist so
  // Next.js has something to mount at "/" — without this file, "/" 404s
  // before AuthGuard's effect ever runs.
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF7' }}>
      <div style={{ width: 24, height: 24, border: '2px solid #E0E0E0', borderTopColor: '#534AB7', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}