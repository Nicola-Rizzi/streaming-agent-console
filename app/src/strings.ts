// All user-facing copy. Text that includes a value is a function.
export const strings = {
  app: {
    name: "Assistant",
    noThread: "Select a thread",
    tabTitle: {
      working: "● Working… · Assistant",
      question: "Question for you · Assistant",
      idle: "Assistant",
    },
  },

  threads: {
    label: "Threads",
    loadMore: "Load more…",
    loadFailed: (reason: string) => `Failed to load threads: ${reason}`,
  },

  composer: {
    label: "Message",
    placeholder: "Ask the assistant…",
    noThread: "Select a thread first",
    send: "Send",
    stop: "Stop",
    locked: {
      loading: "Loading the conversation…",
      loadFailed: "This conversation couldn't be loaded",
      full: "This conversation is full. Start a new thread to continue.",
      reconnecting: "Reconnecting…",
      question: "Answer the question above to continue",
      connecting: "Connecting…",
    },
  },

  transcript: {
    loadingLabel: "Loading thread",
    loadFailedTitle: "Couldn't load this thread",
    loadFailedBody: "The service didn't answer. Check that it's running.",
    tryAgain: "Try again",
    emptyTitle: "No messages yet",
    emptyBody: "Ask about your campaigns to start.",
    legacyNotice: "Earlier messages in this conversation use an older format that this version can't display.",
    limitTitle: "This conversation has reached its maximum size.",
    limitBody: "Start a new thread to continue.",
    newContent: "New content",
    backToLatest: "Back to latest",
    label: "Conversation",
  },

  turn: {
    reconnecting: "Connection lost. Reconnecting…",
    done: "✓ Done",
    stopped: "■ Stopped. Everything that arrived is kept.",
    failed: "✕ This turn failed. The error above explains what went wrong.",
    droppedTitle: "The connection dropped",
    droppedBody: "before the answer finished. What arrived is kept.",
    resume: "Resume",
    working: "Working…",
    workingOn: (title: string) => `Working on: ${title}`,
    /** Announced to screen readers when a live turn ends. */
    announce: {
      completed: "The answer is ready.",
      stopped: "Stopped.",
      failed: "This turn failed.",
      interrupted: "The connection dropped before the answer finished.",
      question: "The assistant has a question for you.",
    },
  },

  actions: {
    steps: (count: number) => `${count} ${count === 1 ? "step" : "steps"}`,
    specialists: (count: number) => `${count} ${count === 1 ? "specialist" : "specialists"}`,
    workingOn: (title: string) => `working on: ${title}`,
    specialistTag: "specialist",
    details: "Details",
    detailsWithOutputs: (count: number) => `Details · ${count} ${count === 1 ? "output" : "outputs"}`,
    stoppedNote: "Stopped before it finished",
    interruptedNote: "Didn't finish: the turn ended while it was running",
    status: { running: "Running", succeeded: "Done", failed: "Failed", interrupted: "Interrupted", stopped: "Stopped" },
  },

  thinking: {
    live: "Thinking…",
    settled: "Reasoning",
  },

  content: {
    artifactMissing: (id: string) => `This artifact isn't available (${id}).`,
    artifactUnsupported: (type: string) => `This kind of content can't be shown here yet (${type}).`,
    unsupported: (type: string) => `Some content here can't be shown in this version (${type}).`,
    legacyReply: "This reply uses an older format that this version can't display.",
    renderFailed: "This part of the answer couldn't be displayed.",
    tableRows: (shown: number, total: number) => `Showing ${shown} of ${total} rows`,
    chartTitle: "Chart",
    chartSummary: (kinds: string[], series: number, names: string[]) =>
      `${kinds.join(", ")} chart · ${series} series${names.length > 0 ? `: ${names.join(", ")}` : ""}`,
    fileExtension: "FILE",
    chartKind: "chart",
    emptyCell: "—",
  },

  questions: {
    chooseAny: "(choose any)",
    otherPlaceholder: "Other: answer in your own words",
    otherLabel: (question: string) => `Other answer to: ${question}`,
    footer: "You can leave any question blank. All answers are sent together.",
    label: "Question from the assistant",
    send: "Send answers",
    /** Sent for a question left blank. */
    noAnswer: "no answer",
  },

  format: {
    separator: " · ",
    seconds: (seconds: number | string) => `${seconds}s`,
    minutes: (minutes: number) => `${minutes}m`,
    bytes: (size: number) => `${size} B`,
    kilobytes: (size: string) => `${size} KB`,
    megabytes: (size: string) => `${size} MB`,
  },

  errors: {
    sendRefused: "Your message couldn't be sent",
    untitled: "Something went wrong",
  },
};
