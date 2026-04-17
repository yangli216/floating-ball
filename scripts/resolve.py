import os
import re

files = [
    'src/services/pmphai.ts',
    'src/components/ConsultationPage.vue',
    'src/composables/useWindowManagement.ts',
    'src/composables/useWorkMode.ts',
    'src/App.vue'
]

HEAD_REGEX = re.compile(r'<<<<<<< HEAD\n(.*?)\n=======\n.*?\n>>>>>>> [^\n]+\n', re.DOTALL)

for f in files:
    with open(f, 'r') as file:
        content = file.read()
    
    new_content = HEAD_REGEX.sub(r'\1\n', content)
    
    with open(f, 'w') as file:
        file.write(new_content)
    print(f"Resolved {f}")
