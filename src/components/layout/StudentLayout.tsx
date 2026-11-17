import { Outlet } from 'react-router-dom';
import { TopBar } from '../common/TopBar';

export function StudentLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9FC]">
      <TopBar isStudentView />
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
