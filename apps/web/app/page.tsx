import { Wizard } from "./components/Wizard";

export default function HomePage() {
  return (
    <div className="container">
      <header className="app-header">
        <h1>QuateCalc</h1>
        <p>הפקת הצעת מחיר אוטומטית מרשימת חומרים</p>
      </header>
      <Wizard />
    </div>
  );
}
