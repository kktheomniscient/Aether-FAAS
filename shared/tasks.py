def execute_function(code_string: str):
    # This is where your FaaS logic lives
    return exec(code_string)