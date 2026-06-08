// Premade, fully editable starting templates for the "Create your own path" flow.
// Each template instantiates as a normal user path (weeks -> tasks + resources) the
// owner can rename, reorder, add to, or delete. Resource links were verified current.

export const TEMPLATES = [
  // ----------------------------- CONSISTENCY -----------------------------
  {
    id:'tpl_75_hard_style',
    skill:'Discipline / Consistency',
    title:'75-Day Consistency Challenge',
    goal:'Build daily discipline with a simple 75-day proof-of-growth challenge.',
    durationDays:75,
    durationLabel:'75 days',
    weeks:[
      { title:'Daily commitments', tasks:[
        {text:'Read 10 pages', scheduleType:'daily', startDay:1, endDay:75},
        {text:'Run or walk 1km', scheduleType:'daily', startDay:1, endDay:75, evidenceRequired:true},
        {text:'Train or stretch for 30 minutes', scheduleType:'daily', startDay:1, endDay:75, evidenceRequired:true},
        {text:'Do one deep-work block', scheduleType:'daily', startDay:1, endDay:75, evidenceRequired:true},
        {text:'Sleep 8 hours or follow your sleep target', scheduleType:'daily', startDay:1, endDay:75},
        {text:'Avoid soda or your chosen vice', scheduleType:'daily', startDay:1, endDay:75},
        {text:'Post one proof-of-work update', scheduleType:'daily', startDay:1, endDay:75, evidenceRequired:true}
      ], resources:[]}
    ]
  },
  // ----------------------------- PYTHON -----------------------------
  {
    id:'tpl_py_fund', skill:'Programming (Python)', title:'Python Fundamentals',
    goal:'Go from zero to writing useful Python programs in 8 weeks.',
    weeks:[
      { title:'Week 1 - Setup and first programs', tasks:[
        {text:'Install Python and VS Code, run a hello-world script'},
        {text:'Learn print(), input(), variables, and basic types (int, float, str)'},
        {text:'Build a tip calculator that takes a bill and outputs the total'}
      ], resources:[
        {label:'Automate the Boring Stuff (free, 3rd ed)', url:'https://automatetheboringstuff.com/3e/'},
        {label:'Harvard CS50P (free)', url:'https://cs50.harvard.edu/python/'}
      ]},
      { title:'Week 2 - Conditionals and logic', tasks:[
        {text:'Learn booleans, comparison and logical operators'},
        {text:'Use if / elif / else to branch'},
        {text:'Build a number-guessing game with higher/lower feedback'}
      ]},
      { title:'Week 3 - Loops', tasks:[
        {text:'Learn while and for loops, range(), break and continue'},
        {text:'Solve FizzBuzz from scratch'},
        {text:'Loop a text menu until the user types quit'}
      ]},
      { title:'Week 4 - Functions', tasks:[
        {text:'Define functions with parameters and return values; understand scope'},
        {text:'Refactor your week-3 game so each part is a function'},
        {text:'Write 3 small reusable helper functions'}
      ]},
      { title:'Week 5 - Data structures', tasks:[
        {text:'Learn lists, tuples, dictionaries, and sets'},
        {text:'Build a contact book stored in a dictionary'},
        {text:'Practice add, look up, update, and delete on your contact book'}
      ]},
      { title:'Week 6 - Strings and files', tasks:[
        {text:'Learn string methods, f-strings, and slicing'},
        {text:'Read from and write to a text file'},
        {text:'Write a word-count script for any .txt file'}
      ], resources:[
        {label:'Official Python tutorial', url:'https://docs.python.org/3/tutorial/'}
      ]},
      { title:'Week 7 - Errors and debugging', tasks:[
        {text:'Learn try / except and how to read a traceback'},
        {text:'Add input validation to your contact book'},
        {text:'Deliberately break a script and practice fixing it from the error'}
      ]},
      { title:'Week 8 - Capstone project', tasks:[
        {text:'Pick one: file organizer, expense tracker, or simple web scraper'},
        {text:'Build it end to end using what you learned'},
        {text:'Write a short README and push it to GitHub'}
      ]}
    ]
  },
  {
    id:'tpl_py_data', skill:'Programming (Python)', title:'Python for Data Analysis',
    goal:'Learn to load, clean, analyze, and chart real datasets with pandas in 8 weeks.',
    weeks:[
      { title:'Week 1 - Refresher and setup', tasks:[
        {text:'Set up Jupyter or Google Colab'},
        {text:'Refresh Python basics: lists, dicts, functions'},
        {text:'Learn numpy arrays and basic vectorized math'}
      ], resources:[
        {label:'Google Colab', url:'https://colab.research.google.com/'}
      ]},
      { title:'Week 2 - pandas basics', tasks:[
        {text:'Learn Series and DataFrame objects'},
        {text:'Load a CSV into a DataFrame'},
        {text:'Inspect data with head(), info(), and describe()'}
      ], resources:[
        {label:'pandas documentation', url:'https://pandas.pydata.org/docs/'}
      ]},
      { title:'Week 3 - Selecting and filtering', tasks:[
        {text:'Use loc and iloc to select rows and columns'},
        {text:'Filter rows with boolean masks'},
        {text:'Sort and rank a dataset by a column'}
      ]},
      { title:'Week 4 - Cleaning data', tasks:[
        {text:'Handle missing values (fillna, dropna)'},
        {text:'Fix data types and rename columns'},
        {text:'Remove duplicates and outliers'}
      ]},
      { title:'Week 5 - Grouping and aggregation', tasks:[
        {text:'Use groupby to summarize by category'},
        {text:'Build a pivot_table'},
        {text:'Answer 3 questions about your dataset with aggregations'}
      ]},
      { title:'Week 6 - Visualization', tasks:[
        {text:'Learn matplotlib basics and the pandas .plot() helper'},
        {text:'Make a bar chart, a line chart, and a histogram'},
        {text:'Label axes and titles so a chart stands on its own'}
      ]},
      { title:'Week 7 - Real dataset project', tasks:[
        {text:'Pick a dataset from Kaggle that interests you'},
        {text:'Write down 3 questions before you start'},
        {text:'Answer all 3 with code and charts'}
      ], resources:[
        {label:'Kaggle datasets', url:'https://www.kaggle.com/datasets'}
      ]},
      { title:'Week 8 - Communicate findings', tasks:[
        {text:'Build a clean notebook: question, code, chart, written takeaway'},
        {text:'Write a 5-sentence summary a non-analyst could follow'},
        {text:'Export the notebook to PDF or HTML and share it'}
      ]}
    ]
  },
  // ----------------------------- SPANISH -----------------------------
  {
    id:'tpl_es_conv', skill:'Spanish (Language)', title:'Spanish: Zero to Conversational',
    goal:'Reach a confident A2 conversational level in Spanish over 12 weeks.',
    weeks:[
      { title:'Week 1 - Sounds and greetings', tasks:[
        {text:'Learn Spanish pronunciation and the alphabet sounds'},
        {text:'Master greetings and introductions'},
        {text:'Understand ser vs estar at a high level'}
      ], resources:[
        {label:'Language Transfer Complete Spanish (free)', url:'https://www.languagetransfer.org/complete-spanish'}
      ]},
      { title:'Week 2 - Present tense', tasks:[
        {text:'Learn subject pronouns'},
        {text:'Conjugate regular -ar, -er, -ir verbs in present tense'},
        {text:'Write 10 sentences about what you do daily'}
      ]},
      { title:'Week 3 - Nouns and numbers', tasks:[
        {text:'Learn noun gender, articles, and plurals'},
        {text:'Count from 1 to 100'},
        {text:'Describe 5 objects around you with article + noun + adjective'}
      ]},
      { title:'Week 4 - Key irregular verbs', tasks:[
        {text:'Learn tener, ir, hacer, and querer'},
        {text:'Learn question words (que, donde, cuando, por que)'},
        {text:'Ask and answer 10 simple questions'}
      ]},
      { title:'Week 5 - Everyday vocabulary', tasks:[
        {text:'Learn food, home, and time vocabulary'},
        {text:'Build 20 sentences describing your day'},
        {text:'Label 15 objects in your home with sticky notes'}
      ], resources:[
        {label:'SpanishDict (dictionary + conjugation)', url:'https://www.spanishdict.com/'}
      ]},
      { title:'Week 6 - Talking about the future', tasks:[
        {text:'Learn the near future: ir a + infinitive'},
        {text:'Make plans for the week in Spanish'},
        {text:'Write a short paragraph about next weekend'}
      ]},
      { title:'Week 7 - Past tense (preterite)', tasks:[
        {text:'Learn the preterite of regular verbs'},
        {text:'Narrate what you did yesterday'},
        {text:'Learn 10 common past-tense irregulars'}
      ]},
      { title:'Week 8 - Listening and shadowing', tasks:[
        {text:'Watch a short Spanish clip with subtitles'},
        {text:'Shadow (repeat aloud) 5 sentences until smooth'},
        {text:'Note 10 new words and review them'}
      ]},
      { title:'Week 9 - Reflexives and routine', tasks:[
        {text:'Learn reflexive verbs (levantarse, ducharse)'},
        {text:'Describe your morning routine out loud'},
        {text:'Record a 60-second voice note about your day'}
      ]},
      { title:'Week 10 - Conversation practice', tasks:[
        {text:'Do a 15-minute exchange with a partner or tutor'},
        {text:'If solo, record a 2-minute monologue and review it'},
        {text:'List the words you reached for but did not know'}
      ]},
      { title:'Week 11 - Imperfect vs preterite', tasks:[
        {text:'Learn the imperfect tense'},
        {text:'Practice choosing imperfect vs preterite'},
        {text:'Tell a short story about your childhood'}
      ]},
      { title:'Week 12 - Capstone conversation', tasks:[
        {text:'Hold or record a 5-minute conversation on a familiar topic'},
        {text:'Review it and note 5 things to improve'},
        {text:'Compare against your week-1 recording'}
      ]}
    ]
  },
  // ----------------------------- GUITAR -----------------------------
  {
    id:'tpl_guitar_beg', skill:'Guitar', title:'Beginner Acoustic Guitar',
    goal:'Play your first full songs with clean chord changes in 10 weeks.',
    weeks:[
      { title:'Week 1 - Setup and first chords', tasks:[
        {text:'Learn the parts of the guitar and how to tune it'},
        {text:'Practice holding the pick and fretting cleanly'},
        {text:'Learn the A and D chords'}
      ], resources:[
        {label:'JustinGuitar Beginner Course (free)', url:'https://www.justinguitar.com/beginner'}
      ]},
      { title:'Week 2 - First chord changes', tasks:[
        {text:'Practice A to D changes'},
        {text:'Learn a basic down strum in time'},
        {text:'Do the one-minute change drill and record your count'}
      ]},
      { title:'Week 3 - The E chord and first song', tasks:[
        {text:'Learn the E chord'},
        {text:'Practice air changes between A, D, E'},
        {text:'Play one easy 3-chord song slowly'}
      ]},
      { title:'Week 4 - Strumming patterns', tasks:[
        {text:'Learn the down-down-up pattern'},
        {text:'Keep time with a metronome at 60 bpm'},
        {text:'Apply the pattern to your song'}
      ]},
      { title:'Week 5 - Minor chords', tasks:[
        {text:'Learn A minor and E minor'},
        {text:'Practice major-to-minor changes'},
        {text:'Play a song that uses a minor chord'}
      ]},
      { title:'Week 6 - G, C and fuller songs', tasks:[
        {text:'Learn the G and C chords'},
        {text:'Practice G to C to D changes'},
        {text:'Play a 4-chord song all the way through'}
      ]},
      { title:'Week 7 - The F chord', tasks:[
        {text:'Learn the mini-F chord'},
        {text:'Build a 20-minute daily practice routine'},
        {text:'Practice transitions into and out of F'}
      ]},
      { title:'Week 8 - Timing and dynamics', tasks:[
        {text:'Play along with a metronome at 70 to 80 bpm'},
        {text:'Practice loud and soft strumming for feel'},
        {text:'Record yourself and check your timing'}
      ]},
      { title:'Week 9 - Learn songs you love', tasks:[
        {text:'Pick 2 songs that use only chords you know'},
        {text:'Learn the chord progressions'},
        {text:'Play each song slowly, then up to tempo'}
      ]},
      { title:'Week 10 - Perform and review', tasks:[
        {text:'Record one full song start to finish'},
        {text:'Compare it to your week-1 recording'},
        {text:'Pick your next 2 songs to learn'}
      ]}
    ]
  },
  // ----------------------------- BLENDER -----------------------------
  {
    id:'tpl_blender_found', skill:'3D (Blender)', title:'Blender 3D Foundations',
    goal:'Learn to model, light, and render your own 3D scenes in 8 weeks.',
    weeks:[
      { title:'Week 1 - Interface and the donut', tasks:[
        {text:'Learn the interface, navigation, and core hotkeys'},
        {text:'Complete the donut tutorial parts 1 to 3'},
        {text:'Save your file and render your first image'}
      ], resources:[
        {label:'Blender Guru Donut Tutorial (free)', url:'https://www.blenderguru.com/'}
      ]},
      { title:'Week 2 - Finish the donut', tasks:[
        {text:'Complete the rest of the donut series'},
        {text:'Practice shading and adding sprinkles'},
        {text:'Render a final image you are happy with'}
      ]},
      { title:'Week 3 - Modeling fundamentals', tasks:[
        {text:'Learn extrude, loop cut, bevel, and the mirror modifier'},
        {text:'Model a simple prop (a mug or a table)'},
        {text:'Keep your topology clean'}
      ]},
      { title:'Week 4 - Materials and shading', tasks:[
        {text:'Learn the Principled BSDF shader'},
        {text:'Use basic shader nodes'},
        {text:'Texture the prop you modeled'}
      ]},
      { title:'Week 5 - Lighting', tasks:[
        {text:'Learn 3-point lighting'},
        {text:'Use an HDRI for environment light'},
        {text:'Light your prop in a small scene'}
      ], resources:[
        {label:'Blender Manual', url:'https://docs.blender.org/manual/en/latest/'}
      ]},
      { title:'Week 6 - Camera and composition', tasks:[
        {text:'Learn camera setup and focal length'},
        {text:'Apply the rule of thirds'},
        {text:'Render a still you are proud of'}
      ]},
      { title:'Week 7 - Basic animation', tasks:[
        {text:'Learn keyframes and the graph editor'},
        {text:'Animate a bouncing ball with good timing'},
        {text:'Render a short animation clip'}
      ]},
      { title:'Week 8 - Mini project', tasks:[
        {text:'Model, light, and render a small complete scene'},
        {text:'Do a pre-render checklist (samples, denoise, format)'},
        {text:'Post it somewhere for feedback'}
      ]}
    ]
  },
  // ----------------------------- DRAWING -----------------------------
  {
    id:'tpl_draw_found', skill:'Drawing', title:'Drawing Fundamentals',
    goal:'Build real drawing control: line, form, perspective, and construction in 10 weeks.',
    weeks:[
      { title:'Week 1 - Mindset and lines', tasks:[
        {text:'Read the Drawabox Lesson 0 mindset and the 50 percent rule'},
        {text:'Practice superimposed lines and ghosted lines'},
        {text:'Fill one page with controlled straight lines'}
      ], resources:[
        {label:'Drawabox (free, exercise based)', url:'https://drawabox.com/'}
      ]},
      { title:'Week 2 - Ellipses', tasks:[
        {text:'Practice ellipses in planes'},
        {text:'Do the ghosted planes exercise'},
        {text:'Fill a page with confident ellipses'}
      ]},
      { title:'Week 3 - The 250 box challenge (start)', tasks:[
        {text:'Learn boxes in 3-point perspective'},
        {text:'Draw 25 boxes a day'},
        {text:'Check line convergence and fix as you go'}
      ]},
      { title:'Week 4 - Finish the boxes', tasks:[
        {text:'Complete the 250 box challenge'},
        {text:'Review your proportion and convergence errors'},
        {text:'Note what improved from box 1 to box 250'}
      ]},
      { title:'Week 5 - Organic forms', tasks:[
        {text:'Practice sausage forms with even width'},
        {text:'Wrap contour lines around forms'},
        {text:'Draw 2 pages of organic constructions'}
      ]},
      { title:'Week 6 - Still life construction', tasks:[
        {text:'Build simple objects from basic forms'},
        {text:'Construct a small still life from observation'},
        {text:'Focus on solid 3D feel, not detail'}
      ]},
      { title:'Week 7 - Perspective scenes', tasks:[
        {text:'Learn 1-point and 2-point perspective'},
        {text:'Draw a simple room in 1-point perspective'},
        {text:'Draw a building corner in 2-point perspective'}
      ]},
      { title:'Week 8 - Gesture and figure', tasks:[
        {text:'Learn gesture drawing'},
        {text:'Do 30-second pose studies'},
        {text:'Fill 2 pages with gestures'}
      ], resources:[
        {label:'Proko (figure drawing)', url:'https://www.proko.com/'}
      ]},
      { title:'Week 9 - Light and shadow', tasks:[
        {text:'Learn core shadow, cast shadow, and reflected light'},
        {text:'Make a 5-step value scale'},
        {text:'Shade 3 simple forms (sphere, cube, cylinder)'}
      ]},
      { title:'Week 10 - Capstone', tasks:[
        {text:'Make one finished construction drawing'},
        {text:'Compare it to your week-1 page'},
        {text:'Write down your 3 biggest weaknesses to target next'}
      ]}
    ]
  },
  // ----------------------------- VIDEO EDITING -----------------------------
  {
    id:'tpl_edit_resolve', skill:'Video Editing', title:'Video Editing in DaVinci Resolve',
    goal:'Edit, mix, color, and deliver a finished video in 8 weeks using the free Resolve.',
    weeks:[
      { title:'Week 1 - Setup and import', tasks:[
        {text:'Install DaVinci Resolve (free version)'},
        {text:'Learn the interface and the Cut and Edit pages'},
        {text:'Import and organize media into bins'}
      ], resources:[
        {label:'Blackmagic official training (free)', url:'https://www.blackmagicdesign.com/products/davinciresolve/training'}
      ]},
      { title:'Week 2 - Rough cut', tasks:[
        {text:'Learn timeline basics and trimming'},
        {text:'Practice ripple and roll edits'},
        {text:'Assemble a 60-second rough cut'}
      ]},
      { title:'Week 3 - Pacing and rhythm', tasks:[
        {text:'Learn J-cuts and L-cuts'},
        {text:'Cut on action to hide edits'},
        {text:'Tighten your rough cut by 20 percent'}
      ]},
      { title:'Week 4 - Audio', tasks:[
        {text:'Set dialogue levels to a consistent loudness'},
        {text:'Add music and sound effects'},
        {text:'Duck music under dialogue'}
      ]},
      { title:'Week 5 - Titles and graphics', tasks:[
        {text:'Add text and a basic lower third'},
        {text:'Animate a title with simple motion'},
        {text:'Keep type readable and on-brand'}
      ]},
      { title:'Week 6 - Color', tasks:[
        {text:'Learn primary color correction on the Color page'},
        {text:'Balance shots so they match'},
        {text:'Apply one simple consistent look'}
      ]},
      { title:'Week 7 - Transitions and effects', tasks:[
        {text:'Use transitions sparingly and intentionally'},
        {text:'Try a speed ramp'},
        {text:'Remove anything that does not serve the story'}
      ]},
      { title:'Week 8 - Deliver', tasks:[
        {text:'Learn export settings for YouTube (H.264, 1080p or 4K)'},
        {text:'Export a finished 1 to 2 minute piece'},
        {text:'Watch it back and list 3 things to improve next time'}
      ]}
    ]
  }
];
