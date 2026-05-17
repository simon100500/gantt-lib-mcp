import React, { useState, useEffect } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  ChevronRight,
  History,
  User,
  Send,
  X,
  HardHat,
  ChevronDown,
  Info,
  Check
} from 'lucide-react';

const STATUS_TYPES = {
  WORKED: 'worked',
  NOT_WORKED: 'not_worked',
  DONE: 'done',
  BLOCKED: 'blocked'
};

const REASON_OPTIONS = [
  { id: 'no_material', label: 'Нет материалов' },
  { id: 'no_workers', label: 'Нет людей' },
  { id: 'front_not_ready', label: 'Фронт не готов' },
  { id: 'waiting_for_predecessor', label: 'Ждем предшественников' },
  { id: 'design_change', label: 'Изменение проекта' },
  { id: 'weather', label: 'Погода' },
  { id: 'equipment', label: 'Поломка техники' },
  { id: 'other', label: 'Другое' },
];

const MOCK_TASKS = [
  {
    id: '1',
    name: 'Армирование плиты перекрытия 2-го этажа',
    path: 'Блок А / Этаж 2 / Плита П2-1',
    plannedDates: '12 мая — 15 мая',
    volume: 120,
    unit: 'м²',
    currentProgress: 35,
    inputMode: 'volume'
  },
  {
    id: '2',
    name: 'Монтаж опалубки колонн',
    path: 'Блок Б / Этаж 1',
    plannedDates: '14 мая — 14 мая',
    volume: null,
    unit: null,
    currentProgress: 0,
    inputMode: 'stepped_percent'
  },
  {
    id: '3',
    name: 'Устройство стяжки пола',
    path: 'Блок А / Этаж 1',
    plannedDates: '10 мая — 16 мая',
    volume: 250,
    unit: 'м²',
    currentProgress: 10,
    inputMode: 'volume'
  }
];

const App = () => {
  const [view, setView] = useState('today'); // 'today' | 'journal'
  const [reporterName, setReporterName] = useState(localStorage.getItem('reporterName') || '');
  const [showIntro, setShowIntro] = useState(!localStorage.getItem('reporterName'));
  const [selectedTask, setSelectedTask] = useState(null);
  const [reports, setReports] = useState([]);
  const [tempName, setTempName] = useState('');

  const handleSaveName = () => {
    if (tempName.trim()) {
      localStorage.setItem('reporterName', tempName);
      setReporterName(tempName);
      setShowIntro(false);
    }
  };

  const submitReport = (taskId, data) => {
    const newReport = {
      id: Date.now(),
      taskId,
      reportDate: new Date().toLocaleDateString('ru-RU'),
      reporterName,
      ...data,
      appliedAt: new Date().toISOString()
    };
    setReports([newReport, ...reports]);
    setSelectedTask(null);
  };

  // Filter tasks: Hide those that are already reported today
  const activeTasks = MOCK_TASKS.filter(task =>
    !reports.some(r => r.taskId === task.id)
  );

  if (showIntro) {
    return (
      <div className= "fixed inset-0 bg-slate-900 flex items-center justify-center p-6 z-50" >
      <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl" >
        <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mb-6" >
          <HardHat className="text-blue-600 w-8 h-8" />
            </div>
            < h1 className = "text-2xl font-bold text-slate-900 mb-2" > Представьтесь </h1>
              < p className = "text-slate-500 mb-6 text-sm" > Введите ваше имя и фамилию для идентификации в журнале работ.</p>
                < input
    type = "text"
    placeholder = "Иван Иванов"
    className = "w-full border-2 border-slate-100 rounded-xl px-4 py-3 mb-6 focus:border-blue-500 outline-none transition-all"
    value = { tempName }
    onChange = {(e) => setTempName(e.target.value)}
          />
  < button
onClick = { handleSaveName }
disabled = {!tempName.trim()}
className = "w-full bg-blue-600 text-white font-bold py-4 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
  >
  Продолжить
  </button>
  </div>
  </div>
    );
  }

return (
  <div className= "min-h-screen bg-slate-50 pb-24 font-sans text-slate-900" >
  <header className="bg-white border-b border-slate-200 px-5 py-4 sticky top-0 z-30" >
    <div className="flex items-center justify-between" >
      <div>
      <h2 className="text-xs font-bold text-blue-600 uppercase tracking-wider" > GetGantt Fact </h2>
        < h1 className = "text-lg font-extrabold text-slate-800" > ЖК "Горизонты" </h1>
          </div>
          < div className = "flex items-center space-x-2 text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full" >
            <User size={ 14 } />
              < span className = "text-xs font-medium max-w-[80px] truncate" > { reporterName } </span>
                </div>
                </div>
                </header>

                < main className = "p-5" >
                  { view === 'today' ? (
                    <div className= "space-y-4" >
                <div className="flex items-center justify-between mb-2" >
                  <h3 className="font-bold flex items-center gap-2" >
                    Задачи на сегодня
                      < span className = "text-xs font-normal bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full" >
                        { activeTasks.length }
                        </span>
                        </h3>
                        </div>

{
  activeTasks.length > 0 ? (
    activeTasks.map(task => (
      <TaskCard 
                  key= { task.id } 
                  task = { task } 
                  onReport = {() => setSelectedTask(task)}
                />
              ))
            ) : (
  <div className= "bg-green-50 border border-green-100 rounded-2xl p-8 text-center" >
  <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" >
    <Check className="text-green-600" />
      </div>
      < h4 className = "font-bold text-green-800" > Все задачи отмечены! </h4>
        < p className = "text-sm text-green-600 mt-1" > На сегодня больше нет активных работ.</p>
          </div>
            )}
</div>
        ) : (
  <JournalView reports= { reports } tasks = { MOCK_TASKS } />
        )}
</main>

{
  selectedTask && (
    <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-y-auto sm:max-w-md sm:mx-auto sm:shadow-2xl animate-in slide-in-from-bottom duration-300" >
      <div className="flex items-center justify-between p-5 border-b border-slate-100" >
        <h2 className="font-bold text-lg" > Отчет по задаче </h2>
          < button onClick = {() => setSelectedTask(null)
} className = "p-2 bg-slate-100 rounded-full" >
  <X size={ 20 } />
    </button>
    </div>
    < ReportForm task = { selectedTask } onSubmit = {(data) => submitReport(selectedTask.id, data)} />
      </div>
      )}

<nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-around items-center z-40 sm:max-w-md sm:mx-auto" >
  <button 
          onClick={ () => setView('today') }
className = {`flex flex-col items-center gap-1 transition-colors ${view === 'today' ? 'text-blue-600' : 'text-slate-400'}`}
        >
  <Calendar size={ 24 } />
    < span className = "text-[10px] font-bold uppercase" > Сегодня </span>
      </button>
      < button
onClick = {() => setView('journal')}
className = {`flex flex-col items-center gap-1 transition-colors ${view === 'journal' ? 'text-blue-600' : 'text-slate-400'}`}
        >
  <History size={ 24 } />
    < span className = "text-[10px] font-bold uppercase" > Журнал </span>
      </button>
      </nav>
      </div>
  );
};

const TaskCard = ({ task, onReport }) => {
  return (
    <div 
      className= "bg-white border border-slate-200 rounded-2xl p-4 shadow-sm active:bg-slate-50 transition-all active:scale-[0.98]"
  onClick = { onReport }
    >
    <div className="text-[10px] text-slate-400 font-medium mb-1 truncate uppercase tracking-tight" > { task.path } </div>
      < h4 className = "font-bold text-slate-800 leading-tight mb-3" > { task.name } </h4>

        < div className = "flex items-center justify-between text-xs mb-3" >
          <div className="flex items-center gap-1.5 text-slate-500" >
            <Clock size={ 12 } />
              < span > { task.plannedDates } </span>
              </div>
              < div className = "font-bold text-slate-700" >
                { task.currentProgress } % готово
                </div>
                </div>

                < div className = "h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-4" >
                  <div 
          className="h-full bg-blue-500 transition-all duration-500"
  style = {{ width: `${task.currentProgress}%` }
}
        />
  </div>

  < button className = "w-full bg-slate-900 text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2" >
    Отметить прогресс
      < ChevronRight size = { 14} />
        </button>
        </div>
  );
};

const ReportForm = ({ task, onSubmit }) => {
  const [status, setStatus] = useState(null);
  const [volumeDone, setVolumeDone] = useState('');
  const [percent, setPercent] = useState(0);
  const [blockerReason, setBlockerReason] = useState('');
  const [comment, setComment] = useState('');

  // Handle auto-completion when "DONE" is selected
  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    if (newStatus === STATUS_TYPES.DONE) {
      if (task.inputMode === 'stepped_percent') {
        setPercent(100);
      }
      // Note: for volume, we might not know total remaining, 
      // but status "done" will imply 100% on server.
    }
  };

  const canSubmit = status && (
    (status === STATUS_TYPES.NOT_WORKED || status === STATUS_TYPES.BLOCKED) ? !!blockerReason : true
  );

  const handleSubmit = () => {
    onSubmit({
      status,
      quantityDone: (status === STATUS_TYPES.WORKED || status === STATUS_TYPES.DONE) && task.inputMode === 'volume' ? parseFloat(volumeDone) : null,
      progressDeltaPercent: (status === STATUS_TYPES.WORKED || status === STATUS_TYPES.DONE) && task.inputMode === 'stepped_percent' ? percent : (status === STATUS_TYPES.DONE ? 100 : null),
      blockerReason: (status === STATUS_TYPES.NOT_WORKED || status === STATUS_TYPES.BLOCKED) ? blockerReason : null,
      comment,
      inputMode: task.inputMode
    });
  };

  return (
    <div className= "flex-1 p-5 space-y-6" >
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100" >
      <div className="text-[10px] text-slate-400 font-bold uppercase mb-1" > { task.path } </div>
        < div className = "font-bold text-sm" > { task.name } </div>
  {
    task.volume && (
      <div className="mt-2 text-xs text-slate-600 font-medium" >
        План: <span className="text-slate-900" > { task.volume } { task.unit } </span>
          </div>
        )}
</div>

  < section >
  <label className="text-xs font-bold text-slate-400 uppercase mb-3 block" > Статус работы сегодня </label>
    < div className = "grid grid-cols-2 gap-3" >
      <ActionButton 
            active={ status === STATUS_TYPES.WORKED }
onClick = {() => handleStatusChange(STATUS_TYPES.WORKED)}
icon = {< Clock size = { 18} />}
label = "В работе"
color = "blue"
  />
  <ActionButton 
            active={ status === STATUS_TYPES.DONE }
onClick = {() => handleStatusChange(STATUS_TYPES.DONE)}
icon = {< CheckCircle2 size = { 18} />}
label = "Завершили"
color = "green"
  />
  <ActionButton 
            active={ status === STATUS_TYPES.NOT_WORKED }
onClick = {() => handleStatusChange(STATUS_TYPES.NOT_WORKED)}
icon = {< X size = { 18} />}
label = "Простой"
color = "slate"
  />
  <ActionButton 
            active={ status === STATUS_TYPES.BLOCKED }
onClick = {() => handleStatusChange(STATUS_TYPES.BLOCKED)}
icon = {< AlertCircle size = { 18} />}
label = "Проблема"
color = "red"
  />
  </div>
  </section>

{/* Dynamic Fields: Volume or Progress */ }
{
  status === STATUS_TYPES.WORKED && (
    <section className="animate-in fade-in slide-in-from-top-2" >
    {
      task.inputMode === 'volume' ? (
        <div>
        <label className= "text-xs font-bold text-slate-400 uppercase mb-2 block" >
        Объем за сегодня({ task.unit
    })
  </label>
    < input
  type = "number"
  inputMode = "decimal"
  placeholder = "0.00"
  className = "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-4 text-xl font-bold outline-none focus:border-blue-500"
  value = { volumeDone }
  onChange = {(e) => setVolumeDone(e.target.value)
}
              />
  </div>
          ) : (
  <div>
  <label className= "text-xs font-bold text-slate-400 uppercase mb-2 block" > Прогресс(%) </label>
  < div className = "grid grid-cols-5 gap-2" >
  {
    [0, 25, 50, 75, 100].map(p => (
      <button 
                    key= { p }
                    onClick = {() => setPercent(p)}
className = {`py-3 rounded-lg font-bold text-sm transition-all ${percent === p ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105' : 'bg-slate-100 text-slate-600'}`}
                  >
  { p } %
  </button>
                ))}
</div>
  </div>
          )}
</section>
      )}

{/* When DONE, show confirmation or optional volume */ }
{
  status === STATUS_TYPES.DONE && (
    <section className="animate-in fade-in slide-in-from-top-2 bg-green-50 p-4 rounded-xl border border-green-100" >
      <div className="flex gap-3" >
        <div className="bg-green-100 p-2 rounded-full h-fit" >
          <CheckCircle2 size={ 20 } className = "text-green-600" />
            </div>
            < div >
            <p className="font-bold text-green-800 text-sm" > Готово к сдаче </p>
              < p className = "text-xs text-green-600" > Будет отмечено 100 % выполнение задачи.</p>
                </div>
                </div>
  {
    task.inputMode === 'volume' && (
      <div className="mt-4" >
        <label className="text-[10px] font-bold text-green-700 uppercase mb-1 block" > Фактический объем(необязательно) </label>
          < input
    type = "number"
    placeholder = { task.volume || '0' }
    className = "w-full bg-white border border-green-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500"
    value = { volumeDone }
    onChange = {(e) => setVolumeDone(e.target.value)
  }
                />
    </div>
           )
}
</section>
      )}

{/* Dynamic Fields: Deviation Reason */ }
{
  (status === STATUS_TYPES.NOT_WORKED || status === STATUS_TYPES.BLOCKED) && (
    <section className="animate-in fade-in slide-in-from-top-2" >
      <label className="text-xs font-bold text-slate-400 uppercase mb-2 block" > Причина отклонения </label>
        < div className = "space-y-2" >
        {
          REASON_OPTIONS.map(opt => (
            <button 
                key= { opt.id }
                onClick = {() => setBlockerReason(opt.id)}
  className = {`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${blockerReason === opt.id ? 'border-red-500 bg-red-50 text-red-700 font-bold' : 'border-slate-100 text-slate-600'}`
}
              >
  { opt.label }
  </button>
            ))}
</div>
  </section>
      )}

{/* Common: Comment */ }
{
  status && (
    <section className="animate-in fade-in slide-in-from-top-2 pb-24" >
      <label className="text-xs font-bold text-slate-400 uppercase mb-2 block" > Комментарий </label>
        < textarea
  className = "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 outline-none focus:border-blue-500 h-24 resize-none"
  placeholder = "Напишите детали здесь..."
  value = { comment }
  onChange = {(e) => setComment(e.target.value)
}
          />
  </section>
      )}

<div className="fixed bottom-0 left-0 right-0 p-5 bg-white border-t border-slate-100 sm:max-w-md sm:mx-auto" >
  <button 
          disabled={ !canSubmit }
onClick = { handleSubmit }
className = {`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-white transition-all shadow-xl active:scale-95 ${canSubmit ? 'bg-blue-600 shadow-blue-200' : 'bg-slate-300'}`}
        >
  <Send size={ 18 } />
          Отправить отчет
  </button>
  </div>
  </div>
  );
};

const ActionButton = ({ active, onClick, icon, label, color }) => {
  const colors = {
    blue: active ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' : 'bg-white text-blue-600 border-blue-100',
    green: active ? 'bg-green-600 text-white border-green-600 shadow-lg shadow-green-100' : 'bg-white text-green-600 border-green-100',
    slate: active ? 'bg-slate-700 text-white border-slate-700 shadow-lg shadow-slate-100' : 'bg-white text-slate-500 border-slate-100',
    red: active ? 'bg-red-600 text-white border-red-600 shadow-lg shadow-red-100' : 'bg-white text-red-600 border-red-100'
  };

  return (
    <button 
      onClick= { onClick }
  className = {`flex flex-col items-center justify-center gap-2 p-4 border-2 rounded-2xl transition-all ${colors[color]}`
}
    >
  { icon }
  < span className = "text-xs font-bold" > { label } </span>
    </button>
  );
};

const JournalView = ({ reports, tasks }) => {
  if (reports.length === 0) {
    return (
      <div className= "flex flex-col items-center justify-center py-20 text-center px-10" >
      <div className="bg-slate-100 p-6 rounded-full mb-4" >
        <History size={ 48 } className = "text-slate-300" />
          </div>
          < h3 className = "font-bold text-slate-800 mb-2" > Журнал пуст </h3>
            < p className = "text-sm text-slate-500" > Здесь будут отображаться ваши отчеты за сегодня.</p>
              </div>
    );
  }

return (
  <div className= "space-y-4" >
  <h3 className="font-bold mb-4" > Отправленные сегодня </h3>
{
  reports.map(report => {
    const task = tasks.find(t => t.id === report.taskId);
    return (
      <div key= { report.id } className = "bg-white rounded-2xl p-4 border border-slate-200" >
        <div className="flex justify-between items-start mb-3" >
          <div className="max-w-[70%]" >
            <div className="text-[10px] text-slate-400 font-bold uppercase truncate" > { task?.name || 'Задача'
  }</div>
  < div className = "text-xs text-slate-500 font-medium" > Отправлено в { new Date(report.appliedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) } </div>
  </div>
  < StatusBadge status = { report.status } />
  </div>

  < div className = "grid grid-cols-2 gap-4 mt-2" >
  {
    report.quantityDone !== null && (
      <div>
      <div className="text-[10px] text-slate-400 font-bold uppercase"> Объем </div>
        < div className="font-bold text-sm text-slate-700" > { report.quantityDone } { task?.unit } </div>
  </div>
  )
}
{
  report.progressDeltaPercent !== null && (
    <div>
    <div className="text-[10px] text-slate-400 font-bold uppercase" > Прогресс </div>
      < div className = "font-bold text-sm text-slate-700" > { report.progressDeltaPercent } % </div>
        </div>
              )
}
{
  report.blockerReason && (
    <div className="col-span-2 bg-red-50 p-2.5 rounded-xl border border-red-100 flex gap-2 items-start" >
      <AlertCircle size={ 14 } className = "text-red-500 mt-0.5 shrink-0" />
        <div className="text-xs text-red-700 leading-tight" >
          <span className="font-bold block mb-0.5" > Причина: </span>
  { REASON_OPTIONS.find(r => r.id === report.blockerReason)?.label }
  </div>
    </div>
              )
}
</div>

{
  report.comment && (
    <div className="mt-3 p-2.5 bg-slate-50 rounded-xl flex gap-2 border border-slate-100" >
      <MessageSquare size={ 14 } className = "text-slate-400 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-600 italic leading-relaxed" > "{report.comment}" </p>
          </div>
            )
}
</div>
        );
      })}
</div>
  );
};

const StatusBadge = ({ status }) => {
  const styles = {
    [STATUS_TYPES.WORKED]: 'bg-blue-100 text-blue-700',
    [STATUS_TYPES.DONE]: 'bg-green-100 text-green-700',
    [STATUS_TYPES.NOT_WORKED]: 'bg-slate-100 text-slate-700',
    [STATUS_TYPES.BLOCKED]: 'bg-red-100 text-red-700',
  };
  const labels = {
    [STATUS_TYPES.WORKED]: 'В работе',
    [STATUS_TYPES.DONE]: 'Готово',
    [STATUS_TYPES.NOT_WORKED]: 'Простой',
    [STATUS_TYPES.BLOCKED]: 'Проблема',
  };

  return (
    <span className= {`text-[10px] font-extrabold px-2 py-1 rounded-lg uppercase tracking-wider ${styles[status]}`
}>
  { labels[status]}
  </span>
  );
};

export default App;