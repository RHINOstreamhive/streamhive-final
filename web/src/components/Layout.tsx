export default function Layout({children}:{children:any}) {
  return <div className='min-h-screen bg-gray-50 text-gray-900'>
    <header className='p-4 font-bold'>StreamHive</header>
    <main className='p-4'>{children}</main>
  </div>;
}
